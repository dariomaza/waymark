import {
  FakeClock,
  InMemoryStorageUnitRepository,
  SequentialIdGenerator,
} from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createStorageUnit,
  publicId,
  resolveAccess,
  Role,
  ShareLevel,
  StorageUnitKind,
  StorageUnitNotFound,
  unitId,
  userId,
  WHOLE_REACH,
} from "@waymark/domain";

import {
  InvalidMachineTokenName,
  MachineTokenNameAlreadyTaken,
} from "./auth-errors.js";
import { CreateMachineToken } from "./create-machine-token.js";
import { MachineTokenScope } from "./machine-token.js";
import { ANY_ISSUER } from "./machine-token-repository.js";
import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
import { hashMachineTokenSecret, looksLikeMachineToken } from "./machine-token-secret.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

/**
 * Ana's house holds a garage and an attic; Bea may view the garage. Bea's own
 * flat holds a wardrobe. The safe in Ana's house is shared with nobody.
 */
const HOUSEHOLD = [
  space("house", null, "ana"),
  space("garage", "house"),
  space("shelf", "garage"),
  space("attic", "house"),
  space("safe", "house"),
  space("flat", null, "bea"),
  space("wardrobe", "flat"),
];

function space(id: string, parentId: string | null, ownerId: string | null = null) {
  return createStorageUnit({
    id: unitId(id),
    parentId: parentId === null ? null : unitId(parentId),
    ownerId: ownerId === null ? null : userId(ownerId),
    name: id,
    kind: StorageUnitKind.ROOM,
    description: null,
    photoId: null,
    publicId: publicId(`public-${id}`),
    now: NOW,
  });
}

const beasAccess = resolveAccess({
  caller: { userId: userId("bea"), role: Role.USER },
  storageUnits: HOUSEHOLD,
  shares: [{ storageUnitId: unitId("garage"), userId: userId("bea"), access: ShareLevel.VIEW }],
});

describe("creating a machine token", () => {
  let machineTokens: InMemoryMachineTokenRepository;
  let clock: FakeClock;
  let createMachineToken: CreateMachineToken;

  beforeEach(() => {
    machineTokens = new InMemoryMachineTokenRepository();
    clock = new FakeClock(NOW);
    createMachineToken = new CreateMachineToken({
      machineTokens,
      storageUnits: new InMemoryStorageUnitRepository(HOUSEHOLD),
      ids: new SequentialIdGenerator("machine-token"),
      clock,
    });
  });

  it("belongs to the person who issued it (ADR 26)", async () => {
    const { machineToken } = await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
      userId: "dario",
    });

    expect(machineToken.userId).toBe("dario");
    expect((await machineTokens.findByName("mcp-server"))?.userId).toBe("dario");
  });

  describe("the secret it hands back", () => {
    it("is a machine token, recognisable as one", async () => {
      const { token } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      expect(looksLikeMachineToken(token)).toBe(true);
    });

    it("is never stored, only its hash", async () => {
      const { token } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      const stored = await machineTokens.findByName("mcp-server");
      expect(stored?.tokenHash).toBe(hashMachineTokenSecret(token));
      expect(stored?.tokenHash).not.toBe(token);
      expect(JSON.stringify(stored)).not.toContain(token);
    });

    it("is different every time, even for the same name after a revoke", async () => {
      const first = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });
      await machineTokens.deleteByName("mcp-server", ANY_ISSUER);
      const second = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      expect(second.token).not.toBe(first.token);
    });
  });

  describe("the record it writes", () => {
    it("keeps the scope it was asked for", async () => {
      await createMachineToken.execute({
        name: "backup",
        scope: MachineTokenScope.ReadWrite,
        userId: "dario",
      });

      expect((await machineTokens.findByName("backup"))?.scope).toBe(
        "read-write",
      );
    });

    it("stamps the creation from the clock, never from the wall", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      expect(machineToken.createdAt).toEqual(NOW);
    });

    it("has never been used yet, and says so", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      expect(machineToken.lastUsedAt).toBeNull();
    });

    it("never lapses unless somebody asked for a lifetime", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      expect(machineToken.expiresAt).toBeNull();
    });

    it("lapses when a lifetime was asked for, counted from now", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
        expiresInDays: 30,
      });

      expect(machineToken.expiresAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
    });
  });

  describe("the name", () => {
    it("is normalized, so revoking it later is not a guess about capitals", async () => {
      await createMachineToken.execute({
        name: "  MCP-Server ",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      expect(await machineTokens.findByName("mcp-server")).not.toBeNull();
    });

    it("refuses a second token under a name already in use", async () => {
      await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      await expect(
        createMachineToken.execute({
          name: "MCP-SERVER",
          scope: MachineTokenScope.ReadWrite,
          userId: "dario",
        }),
      ).rejects.toThrow(MachineTokenNameAlreadyTaken);
    });

    it("leaves the live token alone when a duplicate is refused", async () => {
      const first = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        userId: "dario",
      });

      await expect(
        createMachineToken.execute({
          name: "mcp-server",
          scope: MachineTokenScope.ReadWrite,
          userId: "dario",
        }),
      ).rejects.toThrow();

      const stored = await machineTokens.findByName("mcp-server");
      expect(stored?.tokenHash).toBe(hashMachineTokenSecret(first.token));
      expect(stored?.scope).toBe("read");
    });

    it("refuses an empty name, because a token nobody can name cannot be revoked", async () => {
      await expect(
        createMachineToken.execute({ name: "   ", scope: MachineTokenScope.Read, userId: "dario" }),
      ).rejects.toThrow(InvalidMachineTokenName);
    });

    it.each(["mcp server", "mcp/server", "mcp;rm -rf", "café"])(
      "refuses %o, which is a name somebody has to retype into a shell",
      async (name) => {
        await expect(
          createMachineToken.execute({ name, scope: MachineTokenScope.Read, userId: "dario" }),
        ).rejects.toThrow(InvalidMachineTokenName);
      },
    );

    it.each(["mcp-server", "backup2", "home_assistant", "mcp.read"])(
      "accepts %o",
      async (name) => {
        await expect(
          createMachineToken.execute({ name, scope: MachineTokenScope.Read, userId: "dario" }),
        ).resolves.toBeDefined();
      },
    );
  });

  /**
   * The issuer may narrow a token to spaces they can see (ADR 26). Anything
   * else in the list is refused as a missing space is, so the request cannot
   * be used to learn which ids are real.
   */
  describe("narrowed to chosen spaces", () => {
    const issue = (spaceIds: readonly string[]) =>
      createMachineToken.execute({
        name: "beas-assistant",
        scope: MachineTokenScope.Read,
        userId: "bea",
        narrowTo: { spaceIds, issuerAccess: beasAccess },
      });

    it("reaches the issuer's whole reach when none were chosen", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "beas-assistant",
        scope: MachineTokenScope.Read,
        userId: "bea",
      });

      expect(machineToken.chosenSpaces).toEqual(WHOLE_REACH);
    });

    it("keeps the spaces chosen, which the issuer can see", async () => {
      await issue(["garage", "wardrobe"]);

      expect((await machineTokens.findByName("beas-assistant"))?.chosenSpaces).toEqual({
        narrowed: true,
        spaceIds: ["garage", "wardrobe"],
      });
    });

    it("keeps each once, and not one inside another, in the order chosen", async () => {
      const { machineToken } = await issue(["shelf", "wardrobe", "garage", "wardrobe"]);

      expect(machineToken.chosenSpaces).toEqual({
        narrowed: true,
        spaceIds: ["wardrobe", "garage"],
      });
    });

    it.each([["safe"], ["house"], ["no-such-space"]])(
      "refuses %s, which the issuer cannot see, as a missing space, and issues nothing",
      async (unseen) => {
        await expect(issue(["garage", unseen])).rejects.toEqual(
          new StorageUnitNotFound(unitId(unseen)),
        );
        expect(await machineTokens.findByName("beas-assistant")).toBeNull();
      },
    );
  });
});
