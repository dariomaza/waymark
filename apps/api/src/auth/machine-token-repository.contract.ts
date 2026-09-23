import type { RepositoryHarness } from "@waymark/domain-contract-tests";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MachineTokenScope,
  type MachineToken,
} from "./machine-token.js";
import type { MachineTokenRepository } from "./machine-token-repository.js";

/**
 * # The shared contract for `MachineTokenRepository`
 *
 * Run twice, exactly as every domain repository is: once against the in-memory
 * implementation, once against Prisma on a real SQLite file. Two runs of one
 * suite is the only thing that makes the port worth its indirection — a fake
 * that has never been measured against the real adapter is a second
 * implementation of nothing.
 *
 * ## Why this suite is here and not in `@waymark/domain-contract-tests`
 *
 * That package exists so the DOMAIN's port contracts can be consumed without
 * `@waymark/domain` ever depending on a test framework, and it depends on
 * `@waymark/domain` and nothing else. A machine token is not a domain concept:
 * it lives in `@waymark/api` beside `User` and `Session`, for the reason
 * `user.ts` gives — "who is allowed in" is not a statement about boxes. Putting
 * this suite in the shared package would make it depend on `@waymark/api`,
 * which already devDepends on IT, and a cycle in the dependency graph is a
 * worse thing to own than a suite that lives next to the port it describes.
 *
 * What matters is the property, not the address: the suite is written once and
 * both implementations are pushed through it.
 */

const A_MOMENT = new Date("2026-04-01T10:00:00.000Z");
const A_LATER_MOMENT = new Date("2026-04-01T11:30:00.000Z");

const aMachineToken = (
  overrides: Partial<MachineToken> = {},
): MachineToken => ({
  id: "token-1",
  name: "mcp-server",
  tokenHash: "hash-1",
  scope: MachineTokenScope.Read,
  createdAt: A_MOMENT,
  expiresAt: null,
  lastUsedAt: null,
  ...overrides,
});

export const machineTokenRepositoryContract = (
  harness: RepositoryHarness<MachineTokenRepositoryContext>,
): void => {
  describe(`MachineTokenRepository contract: ${harness.name}`, () => {
    let machineTokens: MachineTokenRepository;

    beforeEach(async () => {
      ({ machineTokens } = await harness.setUp());
    });

    describe("finding one by the hash a caller presented", () => {
      it("answers null for a hash nobody was ever issued", async () => {
        expect(await machineTokens.findByTokenHash("nothing")).toBeNull();
      });

      it("finds the token behind a hash it stored", async () => {
        await machineTokens.create(aMachineToken({ tokenHash: "hash-a" }));

        const found = await machineTokens.findByTokenHash("hash-a");

        expect(found?.name).toBe("mcp-server");
      });

      it("gives back every field it was handed", async () => {
        const stored = aMachineToken({
          id: "token-7",
          name: "backup",
          tokenHash: "hash-7",
          scope: MachineTokenScope.ReadWrite,
          createdAt: A_MOMENT,
          expiresAt: A_LATER_MOMENT,
          lastUsedAt: A_MOMENT,
        });
        await machineTokens.create(stored);

        expect(await machineTokens.findByTokenHash("hash-7")).toEqual(stored);
      });

      it("keeps a null expiry null, because never lapsing is the normal case", async () => {
        await machineTokens.create(
          aMachineToken({ tokenHash: "hash-b", expiresAt: null }),
        );

        expect((await machineTokens.findByTokenHash("hash-b"))?.expiresAt).toBeNull();
      });

      it("tells one token's hash from another's", async () => {
        await machineTokens.create(
          aMachineToken({ id: "a", name: "reader", tokenHash: "hash-a" }),
        );
        await machineTokens.create(
          aMachineToken({ id: "b", name: "writer", tokenHash: "hash-b" }),
        );

        expect((await machineTokens.findByTokenHash("hash-b"))?.name).toBe(
          "writer",
        );
      });
    });

    describe("finding one by the name a human typed", () => {
      it("answers null for a name nobody used", async () => {
        expect(await machineTokens.findByName("nothing")).toBeNull();
      });

      it("finds the token a name belongs to", async () => {
        await machineTokens.create(aMachineToken({ name: "backup" }));

        expect((await machineTokens.findByName("backup"))?.id).toBe("token-1");
      });
    });

    describe("creating one", () => {
      it("refuses a second token under a name already taken", async () => {
        await machineTokens.create(aMachineToken({ id: "a", tokenHash: "h-a" }));

        await expect(
          machineTokens.create(aMachineToken({ id: "b", tokenHash: "h-b" })),
        ).rejects.toThrow();
      });

      it("accepts two tokens with different names", async () => {
        await machineTokens.create(
          aMachineToken({ id: "a", name: "reader", tokenHash: "h-a" }),
        );
        await machineTokens.create(
          aMachineToken({ id: "b", name: "writer", tokenHash: "h-b" }),
        );

        expect(await machineTokens.list()).toHaveLength(2);
      });
    });

    describe("recording that it was used", () => {
      it("stamps the moment it was presented", async () => {
        await machineTokens.create(aMachineToken({ tokenHash: "hash-a" }));

        await machineTokens.recordLastUsed("token-1", A_LATER_MOMENT);

        expect(
          (await machineTokens.findByTokenHash("hash-a"))?.lastUsedAt,
        ).toEqual(A_LATER_MOMENT);
      });

      it("overwrites an earlier stamp rather than keeping a history", async () => {
        await machineTokens.create(
          aMachineToken({ tokenHash: "hash-a", lastUsedAt: A_MOMENT }),
        );

        await machineTokens.recordLastUsed("token-1", A_LATER_MOMENT);

        expect(
          (await machineTokens.findByTokenHash("hash-a"))?.lastUsedAt,
        ).toEqual(A_LATER_MOMENT);
      });

      it("shrugs at an id that is not there, so a revoke racing a request is not a 500", async () => {
        await expect(
          machineTokens.recordLastUsed("never-existed", A_LATER_MOMENT),
        ).resolves.toBeUndefined();
      });

      it("touches nothing but the stamp", async () => {
        const stored = aMachineToken({ tokenHash: "hash-a" });
        await machineTokens.create(stored);

        await machineTokens.recordLastUsed("token-1", A_LATER_MOMENT);

        expect(await machineTokens.findByTokenHash("hash-a")).toEqual({
          ...stored,
          lastUsedAt: A_LATER_MOMENT,
        });
      });
    });

    describe("revoking one by name", () => {
      it("says it removed one, and the hash then opens nothing", async () => {
        await machineTokens.create(aMachineToken({ tokenHash: "hash-a" }));

        expect(await machineTokens.deleteByName("mcp-server")).toBe(true);
        expect(await machineTokens.findByTokenHash("hash-a")).toBeNull();
      });

      it("says it removed nothing for a name that was never issued", async () => {
        expect(await machineTokens.deleteByName("nothing")).toBe(false);
      });

      it("leaves every other token alone", async () => {
        await machineTokens.create(
          aMachineToken({ id: "a", name: "reader", tokenHash: "h-a" }),
        );
        await machineTokens.create(
          aMachineToken({ id: "b", name: "writer", tokenHash: "h-b" }),
        );

        await machineTokens.deleteByName("reader");

        expect((await machineTokens.findByTokenHash("h-b"))?.name).toBe("writer");
      });
    });

    describe("listing them for a human", () => {
      it("answers an empty list before anything is issued", async () => {
        expect(await machineTokens.list()).toEqual([]);
      });

      it("answers every token, by name, so two runs read the same", async () => {
        await machineTokens.create(
          aMachineToken({ id: "c", name: "writer", tokenHash: "h-c" }),
        );
        await machineTokens.create(
          aMachineToken({ id: "a", name: "backup", tokenHash: "h-a" }),
        );
        await machineTokens.create(
          aMachineToken({ id: "b", name: "mcp-server", tokenHash: "h-b" }),
        );

        expect((await machineTokens.list()).map((token) => token.name)).toEqual([
          "backup",
          "mcp-server",
          "writer",
        ]);
      });
    });
  });
};

/** Everything a `MachineTokenRepository` contract run needs, which is the port. */
export interface MachineTokenRepositoryContext {
  readonly machineTokens: MachineTokenRepository;
}
