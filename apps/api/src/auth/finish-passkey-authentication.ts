import type { Clock, IdGenerator } from "@waymark/domain";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";

import { ClonedPasskey, InvalidPasskey, PasskeyCeremonyExpired } from "./auth-errors.js";
import type { RateLimiter } from "./login-rate-limiter.js";
import { signalsAClonedAuthenticator, type Passkey } from "./passkey.js";
import { PasskeyCeremony } from "./passkey-challenge.js";
import type { PasskeyChallengeRepository } from "./passkey-challenge-repository.js";
import type { PasskeyRepository } from "./passkey-repository.js";
import type { RelyingParty } from "./relying-party.js";
import { openSession, SessionOpener, type Session } from "./session.js";
import type { SessionRepository } from "./session-repository.js";
import { issueSessionToken } from "./session-token.js";
import type { User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

export interface FinishPasskeyAuthenticationDependencies {
  readonly passkeys: PasskeyRepository;
  readonly challenges: PasskeyChallengeRepository;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly relyingParty: RelyingParty;
  readonly rateLimiter: RateLimiter;
  readonly sessionTtlMs?: number;
}

export interface FinishPasskeyAuthenticationCommand {
  readonly ceremonyId: string;
  readonly credential: AuthenticationResponseJSON;
  /** Already resolved by `resolveClientIp`; never a raw header. */
  readonly clientIp: string;
}

export interface PasskeySignIn {
  /** Shown to the client exactly once, exactly as a password's is. */
  readonly token: string;
  readonly session: Session;
  readonly user: User;
}

/**
 * # A thumb, and then the same session a password opens
 *
 * The answer this produces is byte for byte the shape `Login` produces: an
 * opaque 256-bit token, its SHA-256 in the table, thirty sliding days, revoked
 * by deleting the row. ADR 6 is about a MECHANISM, and a new way to prove who
 * you are is a new way to reach it — not a second kind of session.
 *
 * The one thing that differs is `createdWith`, which exists for exactly one
 * rule on exactly one route: a passkey may not be registered from a session a
 * passkey opened (ADR 19).
 */
export class FinishPasskeyAuthentication {
  constructor(private readonly deps: FinishPasskeyAuthenticationDependencies) {}

  async execute(
    command: FinishPasskeyAuthenticationCommand,
  ): Promise<PasskeySignIn> {
    const now = this.deps.clock.now();

    /*
     * Spending the challenge is the FIRST thing that happens, before any
     * lookup and before any signature is checked. A challenge that survived a
     * failed attempt would be a challenge that can be attempted again, and
     * "how many goes do you get at one challenge" is the question this whole
     * table exists to answer with "one".
     */
    const challenge = await this.deps.challenges.consume(
      command.ceremonyId,
      PasskeyCeremony.Authentication,
      now,
    );
    if (challenge === null) {
      throw new PasskeyCeremonyExpired();
    }

    // The assertion names the credential, and the credential names the person.
    // There is no username anywhere in this flow.
    const passkey = await this.deps.passkeys.findByCredentialId(
      command.credential.id,
    );
    if (passkey === null) {
      this.deps.rateLimiter.recordFailure(command.clientIp);
      throw new InvalidPasskey();
    }

    const user = await this.deps.users.findById(passkey.userId);
    if (user === null) {
      // The account went while the credential stayed. The schema cascades, so
      // this is belt and braces rather than an expected path — the same shrug
      // `AuthenticateSession` makes about a session whose user is gone.
      this.deps.rateLimiter.recordFailure(command.clientIp);
      throw new InvalidPasskey();
    }

    const newCounter = await this.#verify(challenge.challenge, passkey, command);

    /*
     * The counter check is AFTER the signature check, deliberately: a
     * regression only means anything about a signature that was genuine, and
     * checking it first would let somebody with no key at all provoke the
     * alarming refusal.
     */
    if (signalsAClonedAuthenticator(passkey.signCount, newCounter)) {
      this.deps.rateLimiter.recordFailure(command.clientIp);
      // The stored counter is deliberately NOT moved, so a genuine
      // authenticator that is still ahead keeps working the moment whatever
      // was answering for it stops.
      throw new ClonedPasskey(passkey.label);
    }

    await this.deps.passkeys.recordUse(passkey.id, now, newCounter);

    // A sign-in that worked is not an attack in progress, exactly as in
    // `Login`: somebody who holds the key is not the threat the counter bounds.
    this.deps.rateLimiter.clear(command.clientIp);

    const { token, tokenHash } = issueSessionToken();
    const session = openSession({
      id: this.deps.ids.next(),
      tokenHash,
      userId: user.id,
      now,
      openedWith: SessionOpener.Passkey,
      ttlMs: this.deps.sessionTtlMs,
    });
    await this.deps.sessions.save(session);

    return { token, session, user };
  }

  /**
   * The signature, the challenge, the origin, the RP ID and the user
   * verification flag, all checked by `@simplewebauthn/server` — which is the
   * whole of ADR 19's dependency argument, because a mistake in any one of
   * them silently accepts something it should not.
   *
   * Everything it throws becomes one `InvalidPasskey`. Which half of a proof
   * failed is free help for whoever is constructing the next attempt, and
   * unlike a registration there is nobody here to be helped: a person signing
   * in has not chosen a device, so there is no advice to give that "that
   * passkey could not be used to sign in" does not already carry.
   */
  async #verify(
    expectedChallenge: string,
    passkey: Passkey,
    command: FinishPasskeyAuthenticationCommand,
  ): Promise<number> {
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: command.credential,
        expectedChallenge,
        expectedOrigin: this.deps.relyingParty.origin,
        expectedRPID: this.deps.relyingParty.id,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: Buffer.from(passkey.publicKey, "base64url"),
          /*
           * Zero, and this is the one argument here that is not simply the
           * stored row — so it is worth being exact about what it means.
           *
           * The library uses this field for ONE thing: comparing it with the
           * counter in the assertion and throwing when it did not go up. Its
           * rule is `(presented > 0 || stored > 0) && presented <= stored`,
           * which is character for character `signalsAClonedAuthenticator`.
           * Handing it zero switches that comparison off and leaves the
           * comparison to us, a few lines below.
           *
           * Nothing is weakened by that, because the identical comparison is
           * made against the real stored value either way. What is gained is
           * that the refusal has a NAME and a sentence: the library throws a
           * generic error that cannot mention which device, and the person
           * reading it needs to know which one to remove. The alternative was
           * to recognise its message, which would turn a library's wording
           * into part of this product's behaviour.
           *
           * An integer comparison is also not the thing ADR 19 refuses to
           * hand-write. CBOR, COSE and a signature over the right bytes are;
           * `presented <= stored` is a decision about what to do when two
           * numbers disagree, and ADR 19 argues that decision at length.
           */
          counter: 0,
          transports: [...passkey.transports] as never,
        },
      });
    } catch {
      this.deps.rateLimiter.recordFailure(command.clientIp);
      throw new InvalidPasskey();
    }

    if (!verification.verified || !verification.authenticationInfo.userVerified) {
      this.deps.rateLimiter.recordFailure(command.clientIp);
      throw new InvalidPasskey();
    }

    return verification.authenticationInfo.newCounter;
  }
}
