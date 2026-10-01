import { Role } from "@waymark/domain";
import { FakeClock, SequentialIdGenerator } from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { UsernameAlreadyTaken } from "./auth-errors.js";
import { CreateUser } from "./create-user.js";
import { ScryptPasswordHasher } from "./password-hasher.js";
import { InMemoryUserRepository } from "./user-repository.fake.js";

const CHEAP_KDF = {
  cost: 1024,
  blockSize: 8,
  parallelism: 1,
  keyLength: 32,
  saltLength: 16,
} as const;

describe("creating an account from the shell", () => {
  let users: InMemoryUserRepository;
  let createUser: CreateUser;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    createUser = new CreateUser({
      users,
      hasher: new ScryptPasswordHasher(CHEAP_KDF),
      ids: new SequentialIdGenerator("user"),
      clock: new FakeClock(new Date("2026-10-01T10:00:00.000Z")),
    });
  });

  describe("the role it is given (ADR 26)", () => {
    it("makes the very first account the administrator", async () => {
      const dario = await createUser.execute({
        username: "dario",
        password: "a-real-password",
      });

      expect(dario.role).toBe(Role.ADMINISTRATOR);
      expect((await users.findByUsername("dario"))?.role).toBe(
        Role.ADMINISTRATOR,
      );
    });

    it("makes every later account a user", async () => {
      await createUser.execute({ username: "dario", password: "a-real-password" });

      const partner = await createUser.execute({
        username: "partner",
        password: "another-password",
      });

      expect(partner.role).toBe(Role.USER);
    });

    it("makes a later account an administrator when asked to", async () => {
      await createUser.execute({ username: "dario", password: "a-real-password" });

      const partner = await createUser.execute({
        username: "partner",
        password: "another-password",
        administrator: true,
      });

      expect(partner.role).toBe(Role.ADMINISTRATOR);
    });
  });

  it("stores the username lower case", async () => {
    const created = await createUser.execute({
      username: "  Dario ",
      password: "a-real-password",
    });

    expect(created.username).toBe("dario");
  });

  it("refuses a username somebody already has", async () => {
    await createUser.execute({ username: "dario", password: "a-real-password" });

    await expect(
      createUser.execute({ username: "DARIO", password: "another-password" }),
    ).rejects.toBeInstanceOf(UsernameAlreadyTaken);
  });
});
