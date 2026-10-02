import { Role } from "@waymark/domain";
import type { RepositoryHarness } from "@waymark/domain-contract-tests";
import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "./user.js";
import {
  LAST_ADMINISTRATOR,
  type UserRepository,
} from "./user-repository.js";

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
  disabledAt: null,
  ...overrides,
});

const LATER = new Date("2026-05-01T12:00:00.000Z");

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

    it("gives back that an account is disabled, and since when", async () => {
      const partner = anAccount("partner", { disabledAt: LATER });

      await users.create(partner);

      expect(await users.findById("partner")).toEqual(partner);
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

    describe("listing every account, for the administrator", () => {
      it("answers every account by username, the disabled ones included", async () => {
        await users.create(anAccount("partner", { disabledAt: LATER }));
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));
        await users.create(anAccount("child"));

        expect((await users.list()).map((user) => user.username)).toEqual([
          "child",
          "dario",
          "partner",
        ]);
      });
    });

    /**
     * There is always at least one active administrator (ADR 26), and the
     * repository is where that is decided: as a condition of the one statement
     * that writes, so two administrators demoting each other at the same
     * instant cannot both succeed.
     */
    describe("changing a role", () => {
      it("makes a user an administrator, and stamps the change", async () => {
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));
        await users.create(anAccount("partner"));

        const changed = await users.changeRole("partner", Role.ADMINISTRATOR, LATER);

        expect(changed).toMatchObject({ role: Role.ADMINISTRATOR, updatedAt: LATER });
        expect((await users.findById("partner"))?.role).toBe(Role.ADMINISTRATOR);
      });

      it("demotes an administrator while another active one remains", async () => {
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));
        await users.create(anAccount("partner", { role: Role.ADMINISTRATOR }));

        await users.changeRole("partner", Role.USER, LATER);

        expect((await users.findById("partner"))?.role).toBe(Role.USER);
      });

      it("refuses to demote the last active administrator, and changes nothing", async () => {
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));
        await users.create(anAccount("partner"));

        expect(await users.changeRole("dario", Role.USER, LATER)).toBe(
          LAST_ADMINISTRATOR,
        );
        expect((await users.findById("dario"))?.role).toBe(Role.ADMINISTRATOR);
      });

      it("does not count a disabled administrator as the one that remains", async () => {
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));
        await users.create(
          anAccount("partner", { role: Role.ADMINISTRATOR, disabledAt: LATER }),
        );

        expect(await users.changeRole("dario", Role.USER, LATER)).toBe(
          LAST_ADMINISTRATOR,
        );
      });

      it("answers null for an account that is not there", async () => {
        expect(await users.changeRole("nobody", Role.USER, LATER)).toBeNull();
      });
    });

    describe("disabling and enabling", () => {
      it("stamps when an account was disabled", async () => {
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));
        await users.create(anAccount("partner"));

        const disabled = await users.disable("partner", LATER);

        expect(disabled).toMatchObject({ disabledAt: LATER });
        expect((await users.findById("partner"))?.disabledAt).toEqual(LATER);
      });

      it("refuses to disable the last active administrator, and changes nothing", async () => {
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));

        expect(await users.disable("dario", LATER)).toBe(LAST_ADMINISTRATOR);
        expect((await users.findById("dario"))?.disabledAt).toBeNull();
      });

      it("disables an administrator while another active one remains", async () => {
        await users.create(anAccount("dario", { role: Role.ADMINISTRATOR }));
        await users.create(anAccount("partner", { role: Role.ADMINISTRATOR }));

        expect(await users.disable("partner", LATER)).toMatchObject({
          disabledAt: LATER,
        });
      });

      it("enables a disabled account again", async () => {
        await users.create(anAccount("partner", { disabledAt: LATER }));

        const enabled = await users.enable("partner", LATER);

        expect(enabled?.disabledAt).toBeNull();
        expect((await users.findById("partner"))?.disabledAt).toBeNull();
      });

      it("answers null for an account that is not there", async () => {
        expect(await users.disable("nobody", LATER)).toBeNull();
        expect(await users.enable("nobody", LATER)).toBeNull();
      });
    });

    describe("changing a password", () => {
      it("keeps the new hash and stamps the change", async () => {
        await users.create(anAccount("partner"));

        const changed = await users.changePassword("partner", "scrypt$new", LATER);

        expect(changed).toMatchObject({ passwordHash: "scrypt$new", updatedAt: LATER });
        expect((await users.findById("partner"))?.passwordHash).toBe("scrypt$new");
      });

      it("answers null for an account that is not there", async () => {
        expect(await users.changePassword("nobody", "scrypt$new", LATER)).toBeNull();
      });
    });
  });
};
