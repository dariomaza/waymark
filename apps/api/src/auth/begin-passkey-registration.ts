import type { Clock, IdGenerator } from "@waymark/domain";
import {
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/server";

import {
  PASSKEY_CHALLENGE_TTL_MS,
  PasskeyCeremony,
  type PasskeyChallenge,
} from "./passkey-challenge.js";
import type { PasskeyChallengeRepository } from "./passkey-challenge-repository.js";
import type { PasskeyRepository } from "./passkey-repository.js";
import type { RelyingParty } from "./relying-party.js";
import type { User } from "./user.js";

export interface BeginPasskeyRegistrationDependencies {
  readonly passkeys: PasskeyRepository;
  readonly challenges: PasskeyChallengeRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly relyingParty: RelyingParty;
  readonly challengeTtlMs?: number;
}

export interface StartedPasskeyCeremony<TOptions> {
  /** Sent back with the answer; how the server finds the challenge again. */
  readonly ceremonyId: string;
  readonly options: TOptions;
}

/**
 * How long the browser's own prompt waits before closing itself.
 *
 * This is the clock a person experiences, and it is deliberately SHORTER than
 * the server's two-minute row (`PASSKEY_CHALLENGE_TTL_MS`). The slow honest
 * case — finding the phone, a thumb that takes three goes — should be refused
 * by the browser, which says so in its own words and leaves the button there,
 * rather than by us, with an error that arrives after the ceremony appeared to
 * succeed.
 */
export const PASSKEY_CEREMONY_TIMEOUT_MS = 60_000;

/**
 * # Asking a device to make a passkey for this person
 *
 * The person is already signed in — with a password, which the route in front
 * of this insists on (ADR 19). This use case knows nothing about that rule: it
 * is handed a `User` and asks for a credential for them.
 *
 * Everything the ceremony demands is decided here, once, rather than in a
 * route or a client:
 *
 * - **User verification is required.** A device that only proves somebody is
 *   present is refused, because a passkey that accepts mere presence is a
 *   passkey in name only and the whole purpose of this is the fingerprint.
 * - **The credential must be discoverable.** That is what lets signing in ask
 *   for no username at all.
 * - **No attestation.** The authenticator is never asked to prove its make and
 *   model; there is nothing here to do with the answer, and asking would
 *   collect the identifying information ADR 19 declines to store.
 */
export class BeginPasskeyRegistration {
  constructor(private readonly deps: BeginPasskeyRegistrationDependencies) {}

  async execute(
    user: User,
  ): Promise<StartedPasskeyCeremony<PublicKeyCredentialCreationOptionsJSON>> {
    const now = this.deps.clock.now();
    // The only path that creates these rows is this one, so it is also the one
    // that sweeps them: the table is bounded by its own traffic and there is no
    // timer for anybody to own or forget.
    await this.deps.challenges.deleteExpired(now);

    const registered = await this.deps.passkeys.listForUser(user.id);

    const options = await generateRegistrationOptions({
      rpID: this.deps.relyingParty.id,
      rpName: this.deps.relyingParty.name,
      userName: user.username,
      userDisplayName: user.username,
      /*
       * The account's own id, so that the `userHandle` a discoverable
       * credential hands back at sign-in names somebody real rather than a
       * value generated for one ceremony and then forgotten. Nothing verifies
       * against it — the credential id is what the lookup is keyed by — but a
       * handle that means nothing is a field that will one day be trusted.
       */
      userID: new TextEncoder().encode(user.id),
      timeout: PASSKEY_CEREMONY_TIMEOUT_MS,
      attestationType: "none",
      /*
       * What the browser needs to say "you already have a passkey on this
       * device" instead of silently making a second one. It is a courtesy and
       * not a guarantee — it travels in the request, which is the one place an
       * attacker is — and the unique index is what actually decides.
       */
      excludeCredentials: registered.map((passkey) => ({
        id: passkey.credentialId,
        transports: [...passkey.transports],
      })),
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
    });

    const challenge: PasskeyChallenge = {
      id: this.deps.ids.next(),
      ceremony: PasskeyCeremony.Registration,
      challenge: options.challenge,
      userId: user.id,
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + (this.deps.challengeTtlMs ?? PASSKEY_CHALLENGE_TTL_MS),
      ),
    };
    await this.deps.challenges.create(challenge);

    return { ceremonyId: challenge.id, options };
  }
}
