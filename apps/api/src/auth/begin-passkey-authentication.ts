import type { Clock, IdGenerator } from "@waymark/domain";
import {
  generateAuthenticationOptions,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

import { TooManyPasskeyAttempts } from "./auth-errors.js";
import { PASSKEY_CEREMONY_TIMEOUT_MS, type StartedPasskeyCeremony } from "./begin-passkey-registration.js";
import type { RateLimiter } from "./login-rate-limiter.js";
import {
  PASSKEY_CHALLENGE_TTL_MS,
  PasskeyCeremony,
  type PasskeyChallenge,
} from "./passkey-challenge.js";
import type { PasskeyChallengeRepository } from "./passkey-challenge-repository.js";
import type { RelyingParty } from "./relying-party.js";

export interface BeginPasskeyAuthenticationDependencies {
  readonly challenges: PasskeyChallengeRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly relyingParty: RelyingParty;
  /**
   * A counter of its own, NOT the one `Login` uses. See the class comment.
   */
  readonly rateLimiter: RateLimiter;
  readonly challengeTtlMs?: number;
}

/**
 * # Asking for a challenge, with no idea who is asking
 *
 * This is the only unauthenticated thing ADR 19 adds, and it answers the same
 * thing to everybody: a random challenge, no credential ids, user verification
 * required. That is deliberate and it is the second reason for discoverable
 * credentials.
 *
 * A username-first sign-in would have to answer "here are the credential ids
 * registered to `dario`" to an anonymous caller, which is two gifts in one
 * response — a way to find out which usernames exist, and a list of somebody's
 * devices. An empty `allowCredentials` has nothing to leak, so the endpoint
 * needs no protection against being asked about the wrong person: there is no
 * person in the question.
 *
 * ## A rate limiter of its own, and why it must not be the login one
 *
 * ADR 7 put a limiter in front of `POST /auth/login` to make PASSWORD guessing
 * expensive, keyed on the client address and counting failures.
 *
 * Sharing it here would be wrong in both directions. A passkey assertion
 * cannot be guessed — it is an ECDSA signature over 256 random bits, which is
 * exactly the argument ADR 17 makes for keeping machine tokens out of that
 * limiter — so counting its failures there would punish something that is not
 * a threat. And the reverse is worse: ten mistyped passwords would take the
 * FINGERPRINT away from somebody whose thumb works perfectly, which is the one
 * thing ADR 19 says must never happen. Two doors, two counters, and neither
 * can close the other.
 *
 * What this one is actually for is smaller and honest: every ceremony writes a
 * row, and an unauthenticated caller should not be able to write them without
 * bound. So a START is counted, not just a failure, and the limit is set where
 * no person could reach it and a flood could.
 */
export class BeginPasskeyAuthentication {
  constructor(private readonly deps: BeginPasskeyAuthenticationDependencies) {}

  async execute(
    clientIp: string,
  ): Promise<StartedPasskeyCeremony<PublicKeyCredentialRequestOptionsJSON>> {
    const decision = this.deps.rateLimiter.check(clientIp);
    if (!decision.allowed) {
      throw new TooManyPasskeyAttempts(decision.retryAfterSeconds);
    }
    // Counted before anything is written, because the row is the cost being
    // bounded. A ceremony somebody starts and abandons still cost a row.
    this.deps.rateLimiter.recordFailure(clientIp);

    const now = this.deps.clock.now();
    // The only path that creates these rows is this one and its registration
    // sibling, so it is also the one that sweeps them.
    await this.deps.challenges.deleteExpired(now);

    const options = await generateAuthenticationOptions({
      rpID: this.deps.relyingParty.id,
      /*
       * Deliberately absent. With no `allowCredentials` the browser asks the
       * person which passkey to use and the assertion tells us who they are —
       * which is what makes this endpoint safe to answer for anybody, and what
       * removes the username from the sign-in screen.
       */
      allowCredentials: [],
      userVerification: "required",
      timeout: PASSKEY_CEREMONY_TIMEOUT_MS,
    });

    const challenge: PasskeyChallenge = {
      id: this.deps.ids.next(),
      ceremony: PasskeyCeremony.Authentication,
      challenge: options.challenge,
      // Nobody yet, and that is the point of a discoverable credential.
      userId: null,
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + (this.deps.challengeTtlMs ?? PASSKEY_CHALLENGE_TTL_MS),
      ),
    };
    await this.deps.challenges.create(challenge);

    return { ceremonyId: challenge.id, options };
  }
}
