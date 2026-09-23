import { FakeClock, SequentialIdGenerator } from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import {
  InvalidPasskey,
  InvalidPasskeyLabel,
  PasskeyAlreadyRegistered,
  PasskeyCeremonyExpired,
  PasskeyDidNotVerifyTheUser,
} from "./auth-errors.js";
import { BeginPasskeyRegistration } from "./begin-passkey-registration.js";
import { FinishPasskeyRegistration } from "./finish-passkey-registration.js";
import { InMemoryPasskeyChallengeRepository } from "./passkey-challenge-repository.fake.js";
import { InMemoryPasskeyRepository } from "./passkey-repository.fake.js";
import type { RelyingParty } from "./relying-party.js";
import {
  aSoftwareAuthenticator,
  type SoftwareAuthenticator,
} from "./testing/software-authenticator.js";
import type { User } from "./user.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");

const RELYING_PARTY: RelyingParty = {
  id: "waymark.example",
  name: "Waymark",
  origin: "https://waymark.example",
};

const DARIO: User = {
  id: "user-dario",
  username: "dario",
  passwordHash: "scrypt$...",
  createdAt: NOW,
  updatedAt: NOW,
};

const SOMEBODY_ELSE: User = { ...DARIO, id: "user-elena", username: "elena" };

/**
 * # Adding a device, watched end to end
 *
 * Nothing here is stubbed. A real P-256 key pair signs real CBOR, and
 * `@simplewebauthn/server` is the thing that judges it — so these cases are
 * about the ceremony rather than about our handling of a mock's return value.
 * What they cannot be about is a real phone; see
 * `testing/software-authenticator.ts`.
 */
describe("adding a passkey", () => {
  let passkeys: InMemoryPasskeyRepository;
  let challenges: InMemoryPasskeyChallengeRepository;
  let clock: FakeClock;
  let begin: BeginPasskeyRegistration;
  let finish: FinishPasskeyRegistration;
  let phone: SoftwareAuthenticator;

  beforeEach(() => {
    passkeys = new InMemoryPasskeyRepository();
    challenges = new InMemoryPasskeyChallengeRepository();
    clock = new FakeClock(NOW);
    begin = new BeginPasskeyRegistration({
      passkeys,
      challenges,
      ids: new SequentialIdGenerator("ceremony"),
      clock,
      relyingParty: RELYING_PARTY,
    });
    finish = new FinishPasskeyRegistration({
      passkeys,
      challenges,
      ids: new SequentialIdGenerator("passkey"),
      clock,
      relyingParty: RELYING_PARTY,
    });
    phone = aSoftwareAuthenticator({
      origin: RELYING_PARTY.origin,
      rpId: RELYING_PARTY.id,
    });
  });

  const register = async (
    label = "Pixel 8",
    user: User = DARIO,
  ): Promise<void> => {
    const started = await begin.execute(user);
    await finish.execute({
      user,
      ceremonyId: started.ceremonyId,
      label,
      credential: phone.register(started.options),
    });
  };

  describe("what the browser is asked for", () => {
    it("names this deployment, so a passkey cannot be minted for another site", async () => {
      const started = await begin.execute(DARIO);

      expect(started.options.rp).toEqual({
        id: "waymark.example",
        name: "Waymark",
      });
    });

    /**
     * ADR 19: the whole point here is the fingerprint. "Preferred" would let
     * an authenticator that merely felt a touch satisfy a ceremony somebody
     * believes proved who they are — a passkey in name only, and worse than
     * none, because it looks like the strong thing.
     */
    it("requires the device to check that it is really you", async () => {
      const started = await begin.execute(DARIO);

      expect(started.options.authenticatorSelection?.userVerification).toBe(
        "required",
      );
    });

    /**
     * A discoverable credential is what makes signing in need no username.
     */
    it("requires a credential the authenticator can find on its own", async () => {
      const started = await begin.execute(DARIO);

      expect(started.options.authenticatorSelection?.residentKey).toBe("required");
      expect(started.options.authenticatorSelection?.requireResidentKey).toBe(true);
    });

    /**
     * Asking for attestation would collect the make and model of somebody's
     * device, and there is nothing here to do with the answer: a household
     * inventory has no authenticator allowlist and will not grow one.
     */
    it("asks the device for no proof of what it is", async () => {
      const started = await begin.execute(DARIO);

      expect(started.options.attestation).toBe("none");
    });

    it("offers the person's own name, which is what the platform prompt shows", async () => {
      const started = await begin.execute(DARIO);

      expect(started.options.user.name).toBe("dario");
    });

    it("gives the browser a minute, which is what the prompt counts down", async () => {
      const started = await begin.execute(DARIO);

      expect(started.options.timeout).toBe(60_000);
    });

    it("hands back a ceremony id to send with the answer", async () => {
      const started = await begin.execute(DARIO);

      expect(started.ceremonyId).toBe("ceremony-1");
    });

    it("keeps the challenge on the server, never only in the client", async () => {
      await begin.execute(DARIO);

      expect(challenges.size).toBe(1);
    });

    it("tells the device about the ones already registered, so it does not offer twice", async () => {
      await register("Pixel 8");

      const started = await begin.execute(DARIO);

      expect(started.options.excludeCredentials?.map((one) => one.id)).toEqual([
        phone.credentialId,
      ]);
    });

    it("excludes only this person's, because it knows nothing about anyone else's devices", async () => {
      await register("Pixel 8");

      const started = await begin.execute(SOMEBODY_ELSE);

      expect(started.options.excludeCredentials).toEqual([]);
    });

    /**
     * The only path that creates these rows is the one that sweeps them, so
     * there is no timer to own and the table is bounded by its own traffic.
     */
    it("sweeps the ceremonies nobody finished", async () => {
      await begin.execute(DARIO);
      clock.advanceBy(3 * 60_000);

      await begin.execute(DARIO);

      expect(challenges.size).toBe(1);
    });
  });

  describe("finishing it", () => {
    it("stores the device under the name the person gave it", async () => {
      await register("Móvil de Darío");

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.label).toBe("Móvil de Darío");
    });

    it("stores it against the person who was signed in", async () => {
      await register();

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.userId).toBe("user-dario");
    });

    it("stores the credential id the authenticator chose", async () => {
      await register();

      expect(await passkeys.findByCredentialId(phone.credentialId)).not.toBeNull();
    });

    it("stores a public key that is long enough to be one", async () => {
      await register();

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect((stored?.publicKey ?? "").length).toBeGreaterThan(40);
    });

    it("stores how the browser reaches the device", async () => {
      await register();

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.transports).toEqual(["internal"]);
    });

    it("has never been used yet, and says so", async () => {
      await register();

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.lastUsedAt).toBeNull();
    });

    it("spends the challenge, so the same answer cannot be sent twice", async () => {
      const started = await begin.execute(DARIO);
      const credential = phone.register(started.options);

      await finish.execute({
        user: DARIO,
        ceremonyId: started.ceremonyId,
        label: "Pixel 8",
        credential,
      });

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8 again",
          credential,
        }),
      ).rejects.toThrow(PasskeyCeremonyExpired);
    });

    it("lets one person register a phone and a laptop", async () => {
      await register("Pixel 8");
      phone = aSoftwareAuthenticator({
        origin: RELYING_PARTY.origin,
        rpId: RELYING_PARTY.id,
      });
      await register("Work laptop");

      expect((await passkeys.listForUser(DARIO.id)).map((one) => one.label)).toEqual([
        "Pixel 8",
        "Work laptop",
      ]);
    });
  });

  describe("what it refuses", () => {
    it("refuses a ceremony id nobody was issued", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: "never-issued",
          label: "Pixel 8",
          credential: phone.register(started.options),
        }),
      ).rejects.toThrow(PasskeyCeremonyExpired);
    });

    it("refuses a ceremony that has gone cold", async () => {
      const started = await begin.execute(DARIO);
      const credential = phone.register(started.options);
      clock.advanceBy(3 * 60_000);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential,
        }),
      ).rejects.toThrow(PasskeyCeremonyExpired);
    });

    /**
     * A registration challenge belongs to the person it was issued to, and
     * that is checked as well as being in the row: this is the case where
     * somebody finishes another person's ceremony with their own device.
     */
    it("refuses somebody finishing another person's ceremony", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: SOMEBODY_ELSE,
          ceremonyId: started.ceremonyId,
          label: "My device",
          credential: phone.register(started.options),
        }),
      ).rejects.toThrow(InvalidPasskey);
    });

    /**
     * The challenge is the one value that must not be replayable. Signing
     * anything other than what was asked for is the attack.
     */
    it("refuses an answer that signed a different challenge", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential: phone.register(started.options, {
            challenge: "c29tZXRoaW5nLWVsc2U",
          }),
        }),
      ).rejects.toThrow(InvalidPasskey);
    });

    it("refuses an answer from a page that was not this origin", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential: phone.register(started.options, {
            origin: "https://waymark.example.evil",
          }),
        }),
      ).rejects.toThrow(InvalidPasskey);
    });

    /**
     * The RP ID is hashed into the bytes the authenticator signs, so this is
     * what stops a credential minted for another site being presented here.
     */
    it("refuses an answer that named another relying party", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential: phone.register(started.options, { rpId: "another.example" }),
        }),
      ).rejects.toThrow(InvalidPasskey);
    });

    it("refuses an answer that claims to be a sign-in", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential: phone.register(started.options, { type: "webauthn.get" }),
        }),
      ).rejects.toThrow(InvalidPasskey);
    });

    /**
     * This is the cost of `userVerification: "required"`, and it is paid by a
     * security key with no PIN and no sensor. The password form is untouched.
     */
    it("refuses a device that only proved somebody was standing there", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "An old key",
          credential: phone.register(started.options, { userVerified: false }),
        }),
      ).rejects.toThrow(PasskeyDidNotVerifyTheUser);
    });

    it("refuses a device that is already registered", async () => {
      await register("Pixel 8");
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8 again",
          credential: phone.register(started.options),
        }),
      ).rejects.toThrow(PasskeyAlreadyRegistered);
    });

    it("refuses a name that is only spaces", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "   ",
          credential: phone.register(started.options),
        }),
      ).rejects.toThrow(InvalidPasskeyLabel);
    });

    /**
     * Checked before the challenge is spent, so somebody who mistypes the name
     * is not sent back to the fingerprint prompt for it.
     */
    it("leaves the ceremony alive when only the name was wrong", async () => {
      const started = await begin.execute(DARIO);
      const credential = phone.register(started.options);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "",
          credential,
        }),
      ).rejects.toThrow(InvalidPasskeyLabel);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential,
        }),
      ).resolves.toBeDefined();
    });

    it("stores nothing at all when it refuses", async () => {
      const started = await begin.execute(DARIO);

      await expect(
        finish.execute({
          user: DARIO,
          ceremonyId: started.ceremonyId,
          label: "Pixel 8",
          credential: phone.register(started.options, { rpId: "another.example" }),
        }),
      ).rejects.toThrow(InvalidPasskey);

      expect(passkeys.size).toBe(0);
    });
  });
});
