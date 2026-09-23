import { FakeClock, SequentialIdGenerator } from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ClonedPasskey,
  InvalidPasskey,
  PasskeyCeremonyExpired,
  TooManyPasskeyAttempts,
} from "./auth-errors.js";
import { BeginPasskeyAuthentication } from "./begin-passkey-authentication.js";
import { BeginPasskeyRegistration } from "./begin-passkey-registration.js";
import { FinishPasskeyAuthentication } from "./finish-passkey-authentication.js";
import { FinishPasskeyRegistration } from "./finish-passkey-registration.js";
import { FixedWindowRateLimiter } from "./login-rate-limiter.js";
import { InMemoryPasskeyChallengeRepository } from "./passkey-challenge-repository.fake.js";
import { InMemoryPasskeyRepository } from "./passkey-repository.fake.js";
import type { RelyingParty } from "./relying-party.js";
import { SESSION_TTL_MS, SessionOpener, type Session } from "./session.js";
import type { SessionRepository } from "./session-repository.js";
import { hashSessionToken } from "./session-token.js";
import {
  aSoftwareAuthenticator,
  type SoftwareAuthenticator,
} from "./testing/software-authenticator.js";
import type { User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const CALLER = "203.0.113.7";

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

/** Just enough of the port to answer "who is this". */
const usersHolding = (...people: readonly User[]): UserRepository => ({
  findById: async (id) => people.find((person) => person.id === id) ?? null,
  findByUsername: async (username) =>
    people.find((person) => person.username === username) ?? null,
  create: async () => {
    throw new Error("not part of this ceremony");
  },
});

/**
 * A session repository that keeps what it is given, so a test can look at the
 * session that was opened rather than at a spy's call log.
 */
class RecordingSessionRepository implements SessionRepository {
  readonly saved: Session[] = [];

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.saved.find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async save(session: Session): Promise<void> {
    this.saved.push(session);
  }

  async delete(id: string): Promise<void> {
    const at = this.saved.findIndex((session) => session.id === id);
    if (at >= 0) {
      this.saved.splice(at, 1);
    }
  }

  async deleteExpired(): Promise<number> {
    return 0;
  }
}

/**
 * # Signing in with a thumb, watched end to end
 *
 * Real keys, real signatures, and `@simplewebauthn/server` doing the judging.
 * What is NOT here is a browser, a phone or a security key — see
 * `testing/software-authenticator.ts` for exactly what that means.
 */
describe("signing in with a passkey", () => {
  let passkeys: InMemoryPasskeyRepository;
  let challenges: InMemoryPasskeyChallengeRepository;
  let clock: FakeClock;
  let sessions: RecordingSessionRepository;
  let limiter: FixedWindowRateLimiter;
  let begin: BeginPasskeyAuthentication;
  let finish: FinishPasskeyAuthentication;
  let phone: SoftwareAuthenticator;

  const buildFinish = (): FinishPasskeyAuthentication =>
    new FinishPasskeyAuthentication({
      passkeys,
      challenges,
      users: usersHolding(DARIO),
      sessions,
      ids: new SequentialIdGenerator("session"),
      clock,
      relyingParty: RELYING_PARTY,
      rateLimiter: limiter,
    });

  const givenAPasskeyFor = async (
    authenticator: SoftwareAuthenticator,
    user: User = DARIO,
    label = "Pixel 8",
  ): Promise<void> => {
    const beginRegistration = new BeginPasskeyRegistration({
      passkeys,
      challenges,
      ids: new SequentialIdGenerator("registration"),
      clock,
      relyingParty: RELYING_PARTY,
    });
    const finishRegistration = new FinishPasskeyRegistration({
      passkeys,
      challenges,
      ids: new SequentialIdGenerator("passkey"),
      clock,
      relyingParty: RELYING_PARTY,
    });

    const started = await beginRegistration.execute(user);
    await finishRegistration.execute({
      user,
      ceremonyId: started.ceremonyId,
      label,
      credential: authenticator.register(started.options),
    });
  };

  const signIn = async (
    authenticator: SoftwareAuthenticator = phone,
    overrides?: Parameters<SoftwareAuthenticator["assert"]>[1],
  ): ReturnType<FinishPasskeyAuthentication["execute"]> => {
    const started = await begin.execute(CALLER);

    return finish.execute({
      ceremonyId: started.ceremonyId,
      credential: authenticator.assert(started.options, overrides),
      clientIp: CALLER,
    });
  };

  beforeEach(async () => {
    passkeys = new InMemoryPasskeyRepository();
    challenges = new InMemoryPasskeyChallengeRepository();
    clock = new FakeClock(NOW);
    sessions = new RecordingSessionRepository();
    limiter = new FixedWindowRateLimiter({
      clock,
      limit: 5,
      windowMs: 15 * 60_000,
    });
    begin = new BeginPasskeyAuthentication({
      challenges,
      ids: new SequentialIdGenerator("ceremony"),
      clock,
      relyingParty: RELYING_PARTY,
      rateLimiter: limiter,
    });
    finish = buildFinish();
    phone = aSoftwareAuthenticator({
      origin: RELYING_PARTY.origin,
      rpId: RELYING_PARTY.id,
    });

    await givenAPasskeyFor(phone);
  });

  describe("what the browser is asked for", () => {
    /**
     * ADR 19: a username-first flow would have to answer "here are the
     * credential ids registered to dario" to an anonymous caller, which is an
     * account enumeration oracle AND a list of somebody's devices. This
     * endpoint answers a random challenge, to everybody, always.
     */
    it("names no credentials at all, so it tells an anonymous caller nothing", async () => {
      const started = await begin.execute(CALLER);

      expect(started.options.allowCredentials ?? []).toEqual([]);
    });

    it("names this deployment", async () => {
      const started = await begin.execute(CALLER);

      expect(started.options.rpId).toBe("waymark.example");
    });

    it("requires the device to check that it is really you", async () => {
      const started = await begin.execute(CALLER);

      expect(started.options.userVerification).toBe("required");
    });

    it("answers the same to somebody with no passkeys as to somebody with one", async () => {
      const forSomebodyKnown = await begin.execute(CALLER);
      const forAStranger = await begin.execute("198.51.100.4");

      expect(forAStranger.options.allowCredentials).toEqual(
        forSomebodyKnown.options.allowCredentials,
      );
      expect(forAStranger.options.userVerification).toBe(
        forSomebodyKnown.options.userVerification,
      );
    });
  });

  describe("the session it opens", () => {
    /**
     * ADR 6, unchanged: one mechanism. A passkey is another way to reach it,
     * not a second kind of session.
     */
    it("hands back an opaque token, exactly as a password does", async () => {
      const { token } = await signIn();

      expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/u);
    });

    it("stores the hash of it and never the token", async () => {
      const { token, session } = await signIn();

      expect(session.tokenHash).toBe(hashSessionToken(token));
      expect(JSON.stringify(sessions.saved)).not.toContain(token);
    });

    it("belongs to the person the credential named", async () => {
      const { user, session } = await signIn();

      expect(user.username).toBe("dario");
      expect(session.userId).toBe("user-dario");
    });

    it("lasts the same thirty days a password's does", async () => {
      const { session } = await signIn();

      expect(session.expiresAt).toEqual(new Date(NOW.getTime() + SESSION_TTL_MS));
    });

    /**
     * The one thing that distinguishes it, and it exists for exactly one rule:
     * a passkey may not be registered from a session a passkey opened (ADR 19).
     */
    it("remembers that a passkey opened it", async () => {
      const { session } = await signIn();

      expect(session.createdWith).toBe(SessionOpener.Passkey);
    });

    it("is actually saved, so the very next request finds it", async () => {
      await signIn();

      expect(sessions.saved).toHaveLength(1);
    });
  });

  describe("what it records about the device", () => {
    it("stamps when the passkey was last used", async () => {
      await signIn();

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.lastUsedAt).toEqual(NOW);
    });

    it("stamps it on every sign-in, not once an hour", async () => {
      await signIn();
      clock.advanceBy(60_000);
      await signIn();

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.lastUsedAt).toEqual(new Date(NOW.getTime() + 60_000));
    });

    it("moves the counter to whatever the device reported", async () => {
      await signIn(phone, { signCount: 12 });

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.signCount).toBe(12);
    });
  });

  describe("what it refuses", () => {
    it("refuses a ceremony id nobody was issued", async () => {
      const started = await begin.execute(CALLER);

      await expect(
        finish.execute({
          ceremonyId: "never-issued",
          credential: phone.assert(started.options),
          clientIp: CALLER,
        }),
      ).rejects.toThrow(PasskeyCeremonyExpired);
    });

    it("refuses a ceremony that has gone cold", async () => {
      const started = await begin.execute(CALLER);
      const credential = phone.assert(started.options);
      clock.advanceBy(3 * 60_000);

      await expect(
        finish.execute({ ceremonyId: started.ceremonyId, credential, clientIp: CALLER }),
      ).rejects.toThrow(PasskeyCeremonyExpired);
    });

    /**
     * The replay, spelled out: the same signed assertion, sent twice.
     */
    it("refuses the very same assertion a second time", async () => {
      const started = await begin.execute(CALLER);
      const credential = phone.assert(started.options);

      await finish.execute({
        ceremonyId: started.ceremonyId,
        credential,
        clientIp: CALLER,
      });

      await expect(
        finish.execute({ ceremonyId: started.ceremonyId, credential, clientIp: CALLER }),
      ).rejects.toThrow(PasskeyCeremonyExpired);
    });

    it("refuses an assertion that signed some other challenge", async () => {
      const started = await begin.execute(CALLER);

      await expect(
        finish.execute({
          ceremonyId: started.ceremonyId,
          credential: phone.assert(started.options, {
            challenge: "c29tZXRoaW5nLWVsc2U",
          }),
          clientIp: CALLER,
        }),
      ).rejects.toThrow(InvalidPasskey);
    });

    it("refuses an assertion from a page that was not this origin", async () => {
      await expect(
        signIn(phone, { origin: "https://waymark.example.evil" }),
      ).rejects.toThrow(InvalidPasskey);
    });

    it("refuses an assertion that named another relying party", async () => {
      await expect(signIn(phone, { rpId: "another.example" })).rejects.toThrow(
        InvalidPasskey,
      );
    });

    it("refuses an assertion that claims to be a registration", async () => {
      await expect(signIn(phone, { type: "webauthn.create" })).rejects.toThrow(
        InvalidPasskey,
      );
    });

    /**
     * The fingerprint is the point. A device that only proved somebody was
     * standing there has not answered the question this ceremony asked.
     */
    it("refuses a device that did not check who was holding it", async () => {
      await expect(signIn(phone, { userVerified: false })).rejects.toThrow(
        InvalidPasskey,
      );
    });

    it("refuses a credential nobody here registered", async () => {
      const stranger = aSoftwareAuthenticator({
        origin: RELYING_PARTY.origin,
        rpId: RELYING_PARTY.id,
      });

      await expect(signIn(stranger)).rejects.toThrow(InvalidPasskey);
    });

    it("refuses one that has been removed from the account", async () => {
      const [stored] = await passkeys.listForUser(DARIO.id);
      await passkeys.deleteFor(DARIO.id, stored?.id ?? "");

      await expect(signIn()).rejects.toThrow(InvalidPasskey);
    });

    it("opens no session when it refuses", async () => {
      await expect(signIn(phone, { rpId: "another.example" })).rejects.toThrow();

      expect(sessions.saved).toHaveLength(0);
    });
  });

  /**
   * # The counter, and the authenticators that do not keep one
   *
   * Most real ones always report zero, so the common case has to work for
   * ever; a counter that goes backwards is the one real signal that two things
   * are answering for one credential.
   */
  describe("a signature counter that went backwards", () => {
    it("accepts a device that never counts, over and over", async () => {
      await signIn(phone, { signCount: 0 });
      await signIn(phone, { signCount: 0 });

      await expect(signIn(phone, { signCount: 0 })).resolves.toBeDefined();
    });

    it("accepts a device whose counter climbs", async () => {
      await signIn(phone, { signCount: 1 });

      await expect(signIn(phone, { signCount: 2 })).resolves.toBeDefined();
    });

    it("refuses one that repeated a count it already used", async () => {
      await signIn(phone, { signCount: 7 });

      await expect(signIn(phone, { signCount: 7 })).rejects.toThrow(ClonedPasskey);
    });

    it("refuses one that went backwards", async () => {
      await signIn(phone, { signCount: 7 });

      await expect(signIn(phone, { signCount: 3 })).rejects.toThrow(ClonedPasskey);
    });

    it("names the device, so the person knows which one to remove", async () => {
      await signIn(phone, { signCount: 7 });

      await expect(signIn(phone, { signCount: 3 })).rejects.toThrow(/Pixel 8/u);
    });

    /**
     * Deliberately NOT deleted. This signal can come from a buggy
     * authenticator, the person may be in a garage, and refusing is enough:
     * the door stays shut and the password form is untouched.
     */
    it("leaves the passkey in place, for the person to decide about", async () => {
      await signIn(phone, { signCount: 7 });

      await expect(signIn(phone, { signCount: 3 })).rejects.toThrow(ClonedPasskey);

      expect(await passkeys.listForUser(DARIO.id)).toHaveLength(1);
    });

    it("does not move the counter when it refuses", async () => {
      await signIn(phone, { signCount: 7 });

      await expect(signIn(phone, { signCount: 3 })).rejects.toThrow(ClonedPasskey);

      const [stored] = await passkeys.listForUser(DARIO.id);
      expect(stored?.signCount).toBe(7);
    });

    it("opens no session when it refuses", async () => {
      await signIn(phone, { signCount: 7 });
      const before = sessions.saved.length;

      await expect(signIn(phone, { signCount: 3 })).rejects.toThrow(ClonedPasskey);

      expect(sessions.saved).toHaveLength(before);
    });
  });

  /**
   * # A counter of its own, so that neither door can close the other
   *
   * ADR 7's limiter exists to make PASSWORD guessing expensive. A passkey
   * assertion cannot be guessed — it is an ECDSA signature over a 256-bit
   * challenge — so counting its failures against the password's window would
   * let ten mistyped passwords take away the fingerprint, which is the one
   * thing ADR 19 says must never happen. This limiter is a separate instance,
   * and it is here to bound the rows an anonymous caller can write.
   */
  describe("too many ceremonies from one caller", () => {
    it("lets an ordinary person press the button as often as a person does", async () => {
      await begin.execute(CALLER);
      await begin.execute(CALLER);

      await expect(begin.execute(CALLER)).resolves.toBeDefined();
    });

    it("refuses to open more ceremonies once the window is full", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await begin.execute(CALLER);
      }

      await expect(begin.execute(CALLER)).rejects.toThrow(TooManyPasskeyAttempts);
    });

    it("says how long to wait", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await begin.execute(CALLER);
      }

      await expect(begin.execute(CALLER)).rejects.toThrow(/second/u);
    });

    it("counts one caller and not another", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await begin.execute(CALLER);
      }

      await expect(begin.execute("198.51.100.4")).resolves.toBeDefined();
    });

    it("forgets about them once the window has passed", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await begin.execute(CALLER);
      }
      clock.advanceBy(16 * 60_000);

      await expect(begin.execute(CALLER)).resolves.toBeDefined();
    });

    /**
     * A sign-in that worked is not an attack in progress, so it clears the
     * count — the same thing `Login` does with the password limiter.
     */
    it("forgets about them the moment a sign-in works", async () => {
      await begin.execute(CALLER);
      await begin.execute(CALLER);
      await begin.execute(CALLER);
      await signIn();

      await expect(begin.execute(CALLER)).resolves.toBeDefined();
      await expect(begin.execute(CALLER)).resolves.toBeDefined();
      await expect(begin.execute(CALLER)).resolves.toBeDefined();
      await expect(begin.execute(CALLER)).resolves.toBeDefined();
    });
  });
});
