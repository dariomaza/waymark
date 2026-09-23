import type { Clock, IdGenerator } from "@waymark/domain";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

import {
  InvalidPasskey,
  InvalidPasskeyLabel,
  PasskeyAlreadyRegistered,
  PasskeyCeremonyExpired,
  PasskeyDidNotVerifyTheUser,
} from "./auth-errors.js";
import {
  isUsablePasskeyLabel,
  normalizePasskeyLabel,
  type Passkey,
} from "./passkey.js";
import { PasskeyCeremony } from "./passkey-challenge.js";
import type { PasskeyChallengeRepository } from "./passkey-challenge-repository.js";
import type { PasskeyRepository } from "./passkey-repository.js";
import type { RelyingParty } from "./relying-party.js";
import type { User } from "./user.js";

export interface FinishPasskeyRegistrationDependencies {
  readonly passkeys: PasskeyRepository;
  readonly challenges: PasskeyChallengeRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly relyingParty: RelyingParty;
}

export interface FinishPasskeyRegistrationCommand {
  /** Whoever the session says is asking. */
  readonly user: User;
  readonly ceremonyId: string;
  /** What this person calls the device. */
  readonly label: string;
  readonly credential: RegistrationResponseJSON;
}

/**
 * # Checking what the authenticator sent back, and keeping the key
 *
 * The verification itself is `@simplewebauthn/server`'s, and that is the whole
 * argument of ADR 19: CBOR, a COSE key, a client data hash, an RP ID hash and
 * an attestation object, where a subtle mistake does not fail — it accepts
 * something it should not. What is written here is everything AROUND that
 * call, which is where the decisions are.
 */
export class FinishPasskeyRegistration {
  constructor(private readonly deps: FinishPasskeyRegistrationDependencies) {}

  async execute(command: FinishPasskeyRegistrationCommand): Promise<Passkey> {
    /*
     * The name is checked FIRST, before the challenge is spent.
     *
     * A ceremony is single-use, so spending it and then refusing the label
     * would mean somebody who left the field blank has to go back to the
     * fingerprint prompt to fix a typing mistake. The order is the difference
     * between an annoying app and a rude one.
     */
    const label = normalizePasskeyLabel(command.label);
    if (!isUsablePasskeyLabel(label)) {
      throw new InvalidPasskeyLabel(command.label);
    }

    const now = this.deps.clock.now();
    const challenge = await this.deps.challenges.consume(
      command.ceremonyId,
      PasskeyCeremony.Registration,
      now,
    );
    if (challenge === null) {
      throw new PasskeyCeremonyExpired();
    }

    /*
     * The row already carries who it was issued to, and this compares it with
     * who is actually asking. The database cannot do this one: it is a
     * relationship between a row and a session, and without it somebody with
     * any session could finish another person's ceremony and end up with a
     * credential on their account.
     */
    if (challenge.userId !== command.user.id) {
      throw new InvalidPasskey();
    }

    const verification = await this.#verify(challenge.challenge, command.credential);

    /*
     * Belt and braces. `requireUserVerification: true` already makes the
     * library refuse an unverified assertion, and this reads the flag it
     * reports back — so the rule survives somebody one day passing that option
     * differently, and the person gets a sentence about their device rather
     * than the generic refusal.
     */
    if (!verification.registrationInfo.userVerified) {
      throw new PasskeyDidNotVerifyTheUser();
    }

    const { credential } = verification.registrationInfo;
    const passkey: Passkey = {
      id: this.deps.ids.next(),
      userId: command.user.id,
      credentialId: credential.id,
      // base64url, because this row travels through JSON and SQLite and back
      // into a `Uint8Array` the library will want; a `Buffer` column would be
      // one more thing for two adapters to agree about.
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      signCount: credential.counter,
      transports: credential.transports ?? [],
      label,
      createdAt: now,
      lastUsedAt: null,
    };

    try {
      await this.deps.passkeys.create(passkey);
    } catch {
      /*
       * The only thing that can fail here is the unique credential id: every
       * other column is one this use case just built. `excludeCredentials`
       * normally prevents it, and it travels in the request, so the index is
       * what actually decides.
       */
      throw new PasskeyAlreadyRegistered();
    }

    return passkey;
  }

  /**
   * The library's refusals arrive as thrown errors with sentences meant for a
   * developer's log — "Unexpected registration response origin", and so on.
   * They are all folded into one `InvalidPasskey`, for the reason
   * `InvalidSession` folds its three: which half of a proof failed is free
   * help for whoever is building the next attempt.
   *
   * The one that is pulled back out is user verification, because that one is
   * not an attack — it is an old security key meeting a rule this product
   * chose — and the person can act on being told so.
   */
  async #verify(
    expectedChallenge: string,
    response: RegistrationResponseJSON,
  ): Promise<{ registrationInfo: { userVerified: boolean; credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] } } }> {
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.deps.relyingParty.origin,
        expectedRPID: this.deps.relyingParty.id,
        requireUserPresence: true,
        requireUserVerification: true,
      });
    } catch (cause) {
      if (looksLikeAUserVerificationRefusal(cause)) {
        throw new PasskeyDidNotVerifyTheUser();
      }

      throw new InvalidPasskey();
    }

    if (!verification.verified) {
      throw new InvalidPasskey();
    }

    return verification;
  }
}

/**
 * The library says so in a sentence rather than in a code, so this reads the
 * sentence — and the consequence of reading it wrong is one degree of
 * helpfulness in a message, never a credential being accepted: the throw
 * happened either way, and both branches refuse.
 */
const looksLikeAUserVerificationRefusal = (cause: unknown): boolean =>
  cause instanceof Error && /user (could not be|not) verified/iu.test(cause.message);
