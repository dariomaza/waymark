import { FakeClock } from "@ariadna/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UuidIdGenerator } from "../adapters/uuid-id-generator.js";
import { PrismaSessionRepository } from "../persistence/prisma-session-repository.js";
import { PrismaUserRepository } from "../persistence/prisma-user-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../persistence/testing/test-database.js";
import { AuthenticateSession } from "./authenticate-session.js";
import { InvalidCredentials, InvalidSession, TooManyLoginAttempts } from "./auth-errors.js";
import { CreateUser } from "./create-user.js";
import { FixedWindowRateLimiter } from "./login-rate-limiter.js";
import { Login } from "./login.js";
import { Logout } from "./logout.js";
import { ScryptPasswordHasher, type PasswordHasher } from "./password-hasher.js";
import { hashSessionToken } from "./session-token.js";

const START = new Date("2026-04-01T10:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Cheap parameters: these cases are about behaviour, not about cost. */
const CHEAP_KDF = {
  cost: 1024,
  blockSize: 8,
  parallelism: 1,
  keyLength: 32,
  saltLength: 16,
} as const;

/**
 * The real hasher, wrapped to count its calls. Nothing is faked: the point is
 * to observe that a verification HAPPENED even when there is no user to verify
 * against, which is what stops an attacker timing the difference.
 */
class CountingPasswordHasher implements PasswordHasher {
  verifications = 0;

  constructor(private readonly delegate: PasswordHasher) {}

  async hash(password: string): Promise<string> {
    return this.delegate.hash(password);
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    this.verifications += 1;
    return this.delegate.verify(password, encoded);
  }
}

describe("authentication against a real database", () => {
  let database: TestDatabase;
  let clock: FakeClock;
  let hasher: CountingPasswordHasher;
  let users: PrismaUserRepository;
  let sessions: PrismaSessionRepository;
  let rateLimiter: FixedWindowRateLimiter;
  let login: Login;
  let logout: Logout;
  let authenticate: AuthenticateSession;
  let createUser: CreateUser;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.destroy();
  });

  beforeEach(async () => {
    await database.reset();
    clock = new FakeClock(START);
    hasher = new CountingPasswordHasher(new ScryptPasswordHasher(CHEAP_KDF));
    users = new PrismaUserRepository(database.client);
    sessions = new PrismaSessionRepository(database.client);
    rateLimiter = new FixedWindowRateLimiter({
      clock,
      limit: 5,
      windowMs: 15 * MINUTE,
    });

    const ids = new UuidIdGenerator();
    createUser = new CreateUser({ users, hasher, ids, clock });
    login = new Login({ users, sessions, hasher, ids, clock, rateLimiter });
    logout = new Logout({ sessions });
    authenticate = new AuthenticateSession({ users, sessions, clock });

    await createUser.execute({ username: "dario", password: "a-real-password" });
  });

  const loginAs = async (username: string, password: string) =>
    login.execute({ username, password, clientIp: "203.0.113.7" });

  describe("login", () => {
    it("hands out a token for the right password", async () => {
      const result = await loginAs("dario", "a-real-password");

      expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/u);
      expect(result.user.username).toBe("dario");
    });

    it("stores the hash of the token, never the token", async () => {
      const { token } = await loginAs("dario", "a-real-password");

      const stored = await database.client.session.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(hashSessionToken(token));
      expect(stored[0]?.tokenHash).not.toBe(token);
    });

    it("issues a different token every time", async () => {
      const first = await loginAs("dario", "a-real-password");
      const second = await loginAs("dario", "a-real-password");

      expect(first.token).not.toBe(second.token);
    });

    it("matches the username case insensitively", async () => {
      await expect(loginAs("DARIO", "a-real-password")).resolves.toBeDefined();
    });

    it("rejects the wrong password", async () => {
      await expect(loginAs("dario", "not-the-password")).rejects.toBeInstanceOf(
        InvalidCredentials,
      );
    });

    it("rejects an unknown user", async () => {
      await expect(loginAs("nobody", "a-real-password")).rejects.toBeInstanceOf(
        InvalidCredentials,
      );
    });

    describe("user enumeration", () => {
      it("raises the very same error for an unknown user and a wrong password", async () => {
        const unknown = await loginAs("nobody", "x").catch((error: unknown) => error);
        const wrong = await loginAs("dario", "x").catch((error: unknown) => error);

        expect((unknown as Error).constructor).toBe((wrong as Error).constructor);
        expect((unknown as Error).message).toBe((wrong as Error).message);
      });

      it("still verifies a password when there is no user, so both paths cost the same", async () => {
        hasher.verifications = 0;
        await loginAs("nobody", "x").catch(() => undefined);
        const forAnUnknownUser = hasher.verifications;

        hasher.verifications = 0;
        await loginAs("dario", "x").catch(() => undefined);
        const forAKnownUser = hasher.verifications;

        // One scrypt derivation either way. Returning early on "no such user"
        // is exactly the timing oracle that lists valid usernames.
        expect(forAnUnknownUser).toBe(1);
        expect(forAKnownUser).toBe(1);
      });

      it("creates no session for an unknown user", async () => {
        await loginAs("nobody", "x").catch(() => undefined);

        await expect(database.client.session.count()).resolves.toBe(0);
      });
    });

    describe("rate limiting", () => {
      it("blocks after too many failures from one address", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await loginAs("dario", "wrong").catch(() => undefined);
        }

        await expect(loginAs("dario", "wrong")).rejects.toBeInstanceOf(
          TooManyLoginAttempts,
        );
      });

      it("blocks the right password too, once the address is blocked", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await loginAs("dario", "wrong").catch(() => undefined);
        }

        await expect(loginAs("dario", "a-real-password")).rejects.toBeInstanceOf(
          TooManyLoginAttempts,
        );
      });

      it("counts each address separately", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await login
            .execute({ username: "dario", password: "wrong", clientIp: "203.0.113.7" })
            .catch(() => undefined);
        }

        await expect(
          login.execute({
            username: "dario",
            password: "a-real-password",
            clientIp: "198.51.100.4",
          }),
        ).resolves.toBeDefined();
      });

      it("forgets the failures after the window", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await loginAs("dario", "wrong").catch(() => undefined);
        }
        clock.advanceBy(15 * MINUTE);

        await expect(loginAs("dario", "a-real-password")).resolves.toBeDefined();
      });

      it("clears the count on a successful login", async () => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await loginAs("dario", "wrong").catch(() => undefined);
        }
        await loginAs("dario", "a-real-password");

        for (let attempt = 0; attempt < 4; attempt += 1) {
          await loginAs("dario", "wrong").catch(() => undefined);
        }

        await expect(loginAs("dario", "a-real-password")).resolves.toBeDefined();
      });

      it("says how long to wait", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await loginAs("dario", "wrong").catch(() => undefined);
        }

        const error: unknown = await loginAs("dario", "wrong").catch(
          (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(TooManyLoginAttempts);
        expect((error as TooManyLoginAttempts).retryAfterSeconds).toBeGreaterThan(0);
      });

      it("does not hash a password for a blocked caller", async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await loginAs("dario", "wrong").catch(() => undefined);
        }

        hasher.verifications = 0;
        await loginAs("dario", "wrong").catch(() => undefined);

        // Otherwise the rate limiter itself becomes the CPU exhaustion vector.
        expect(hasher.verifications).toBe(0);
      });
    });
  });

  describe("session lifetime", () => {
    it("expires 30 days after it was issued", async () => {
      const { session } = await loginAs("dario", "a-real-password");

      expect(session.expiresAt.getTime()).toBe(START.getTime() + 30 * DAY);
    });

    it("accepts a fresh token", async () => {
      const { token } = await loginAs("dario", "a-real-password");

      await expect(authenticate.execute(token)).resolves.toMatchObject({
        user: { username: "dario" },
      });
    });

    it("rejects a token nobody issued", async () => {
      await expect(authenticate.execute("made-up-token")).rejects.toBeInstanceOf(
        InvalidSession,
      );
    });

    it("rejects a token once it has expired", async () => {
      const { token } = await loginAs("dario", "a-real-password");
      clock.advanceBy(30 * DAY);

      await expect(authenticate.execute(token)).rejects.toBeInstanceOf(InvalidSession);
    });

    it("deletes the expired row instead of leaving it to rot", async () => {
      const { token } = await loginAs("dario", "a-real-password");
      clock.advanceBy(30 * DAY);
      await authenticate.execute(token).catch(() => undefined);

      await expect(database.client.session.count()).resolves.toBe(0);
    });

    it("slides the expiry forward while the session is in use", async () => {
      const { token } = await loginAs("dario", "a-real-password");
      clock.advanceBy(29 * DAY);

      await authenticate.execute(token);

      const stored = await database.client.session.findFirst();
      expect(stored?.expiresAt.getTime()).toBe(START.getTime() + 59 * DAY);
    });

    it("does not write on every request, only once the expiry has drifted", async () => {
      const { token } = await loginAs("dario", "a-real-password");
      clock.advanceBy(30 * MINUTE);

      await authenticate.execute(token);

      const stored = await database.client.session.findFirst();
      expect(stored?.expiresAt.getTime()).toBe(START.getTime() + 30 * DAY);
    });
  });

  describe("logout", () => {
    it("revokes the token immediately", async () => {
      const { token } = await loginAs("dario", "a-real-password");

      await logout.execute(token);

      await expect(authenticate.execute(token)).rejects.toBeInstanceOf(InvalidSession);
    });

    it("deletes the row, which is all revocation means here", async () => {
      const { token } = await loginAs("dario", "a-real-password");

      await logout.execute(token);

      await expect(database.client.session.count()).resolves.toBe(0);
    });

    it("leaves the other sessions of the same user alone", async () => {
      const phone = await loginAs("dario", "a-real-password");
      const laptop = await loginAs("dario", "a-real-password");

      await logout.execute(phone.token);

      await expect(authenticate.execute(laptop.token)).resolves.toBeDefined();
    });

    it("is a no-op for a token nobody issued", async () => {
      await expect(logout.execute("made-up-token")).resolves.toBeUndefined();
    });
  });

  describe("createUser", () => {
    it("stores the username lower case", async () => {
      await createUser.execute({ username: "  Marta  ", password: "another-password" });

      await expect(users.findByUsername("marta")).resolves.toMatchObject({
        username: "marta",
      });
    });

    it("never stores the password", async () => {
      await createUser.execute({ username: "marta", password: "a-distinctive-password" });

      const stored = await users.findByUsername("marta");
      expect(stored?.passwordHash).not.toContain("a-distinctive-password");
    });

    it("refuses a username that is already taken, whatever its case", async () => {
      await expect(
        createUser.execute({ username: "DARIO", password: "another-password" }),
      ).rejects.toBeInstanceOf(Error);
    });
  });
});
