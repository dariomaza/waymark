import { Role } from "@waymark/domain";
import type { RepositoryHarness } from "@waymark/domain-contract-tests";
import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

/**
 * # The shared contract for `UserRepository`
 *
 * Run against the in-memory implementation and against Prisma on a real
 * SQLite file, for the reason every contract here is: the fake the use cases
 * are tested with has to be indistinguishable from what ships. It lives beside
 * the port rather than in `@waymark/domain-contract-tests` for the reason
 * `machine-token-repository.contract.ts` gives.
 */
export interface UserRepositoryContext {
  readonly users: UserRepository;
}

const anAccount = (
  id: string,
  overrides: Partial<User> = {},
): User => ({
  id,
  username: id,
  passwordHash: "scrypt$not-a-real-hash",
  role: Role.USER,
  createdAt: new Date("2026-04-01T10:00:00.000Z"),
  updatedAt: new Date("2026-04-01T10:00:00.000Z"),
  ...overrides,
});

export const userRepositoryContract = (
  harness: RepositoryHarness<UserRepositoryContext>,
): void => {
  describe(`UserRepository contract: ${harness.name}`, () => {
    let users: UserRepository;

    beforeEach(async () => {
      ({ users } = await harness.setUp());
    });

    it("gives back every field it was handed, the role included", async () => {
      const dario = anAccount("dario", { role: Role.ADMINISTRATOR });

      await users.create(dario);

      expect(await users.findById("dario")).toEqual(dario);
      expect(await users.findByUsername("dario")).toEqual(dario);
    });

    it("refuses a second account with a username already taken", async () => {
      await users.create(anAccount("dario"));

      await expect(
        users.create(anAccount("someone-else", { username: "dario" })),
      ).rejects.toThrow();
    });

    describe("whether anybody has an account yet", () => {
      it("says nobody, before the first one", async () => {
        expect(await users.anyoneExists()).toBe(false);
      });

      it("says somebody, after it", async () => {
        await users.create(anAccount("dario"));

        expect(await users.anyoneExists()).toBe(true);
      });
    });

    describe("the oldest administrator", () => {
      it("is nobody when there is no administrator", async () => {
        await users.create(anAccount("partner"));

        expect(await users.findOldestAdministrator()).toBeNull();
      });

      it("is the administrator whose account was made first", async () => {
        await users.create(
          anAccount("late-admin", {
            role: Role.ADMINISTRATOR,
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
          }),
        );
        await users.create(
          anAccount("first-admin", {
            role: Role.ADMINISTRATOR,
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
          }),
        );
        await users.create(
          anAccount("oldest-but-a-user", {
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        );

        expect((await users.findOldestAdministrator())?.id).toBe("first-admin");
      });
    });
  });
};
