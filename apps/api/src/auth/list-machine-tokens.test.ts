import {
  createStorageUnit,
  publicId,
  Role,
  StorageUnitKind,
  unitId,
  userId,
  WHOLE_REACH,
  type Access,
  type ChosenSpaces,
} from "@waymark/domain";
import { InMemoryStorageUnitRepository } from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { ListMachineTokens } from "./list-machine-tokens.js";
import { MachineTokenScope, type MachineToken } from "./machine-token.js";
import { THE_SHELL } from "./machine-token-manager.js";
import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
import type { User } from "./user.js";
import { InMemoryUserRepository } from "./user-repository.fake.js";

const A_MOMENT = new Date("2026-10-01T10:00:00.000Z");

const aPerson = (id: string, role: Role = Role.USER): User => ({
  id,
  username: `${id}-name`,
  passwordHash: "unused",
  role,
  createdAt: A_MOMENT,
  updatedAt: A_MOMENT,
});

const EVERYTHING: Access = { kind: "everything" };

const aSpace = (id: string, name: string) =>
  createStorageUnit({
    id: unitId(id),
    parentId: null,
    ownerId: userId("bea"),
    name,
    kind: StorageUnitKind.ROOM,
    publicId: publicId(`PUB-${id}`),
    now: A_MOMENT,
  });

const aToken = (
  name: string,
  userId: string,
  chosenSpaces: ChosenSpaces = WHOLE_REACH,
): MachineToken => ({
  id: `${name}-id`,
  name,
  tokenHash: `${name}-hash`,
  scope: MachineTokenScope.Read,
  userId,
  createdAt: A_MOMENT,
  expiresAt: null,
  lastUsedAt: null,
  chosenSpaces,
});

describe("listing machine tokens (ADR 26)", () => {
  let listMachineTokens: ListMachineTokens;

  beforeEach(() => {
    listMachineTokens = new ListMachineTokens({
      machineTokens: new InMemoryMachineTokenRepository([
        aToken("anas-assistant", "ana"),
        aToken("beas-assistant", "bea"),
        aToken("beas-backup", "bea", {
          narrowed: true,
          spaceIds: [unitId("wardrobe"), unitId("flat"), unitId("gone")],
        }),
      ]),
      storageUnits: new InMemoryStorageUnitRepository([
        aSpace("flat", "Bea flat"),
        aSpace("wardrobe", "Bea wardrobe"),
      ]),
      users: new InMemoryUserRepository([
        aPerson("ana"),
        aPerson("bea"),
        aPerson("dario", Role.ADMINISTRATOR),
      ]),
    });
  });

  const namesAndIssuers = (listed: Awaited<ReturnType<ListMachineTokens["execute"]>>) =>
    listed.map((row) => [row.machineToken.name, row.issuedBy]);

  it("lists for a person only the tokens they issued, without saying whose: theirs", async () => {
    const listed = await listMachineTokens.execute({
      kind: "person",
      userId: "bea",
      role: Role.USER,
    }, EVERYTHING);

    expect(namesAndIssuers(listed)).toEqual([
      ["beas-assistant", null],
      ["beas-backup", null],
    ]);
  });

  it("lists every token for an administrator, each with its issuer's username", async () => {
    const listed = await listMachineTokens.execute({
      kind: "person",
      userId: "dario",
      role: Role.ADMINISTRATOR,
    }, EVERYTHING);

    expect(namesAndIssuers(listed)).toEqual([
      ["anas-assistant", "ana-name"],
      ["beas-assistant", "bea-name"],
      ["beas-backup", "bea-name"],
    ]);
  });

  it("lists every token for the shell, with the issuer too", async () => {
    expect(namesAndIssuers(await listMachineTokens.execute(THE_SHELL, EVERYTHING))).toHaveLength(3);
  });

  describe("the spaces each token was narrowed to", () => {
    const spacesOf = async (sees: Access) =>
      (await listMachineTokens.execute(THE_SHELL, sees)).map((row) => [
        row.machineToken.name,
        row.spaces?.map((unit) => unit.name) ?? null,
      ]);

    it("names them, by name, and says null for a token that was not narrowed", async () => {
      expect(await spacesOf(EVERYTHING)).toEqual([
        ["anas-assistant", null],
        ["beas-assistant", null],
        ["beas-backup", ["Bea flat", "Bea wardrobe"]],
      ]);
    });

    it("names only the spaces the person listing may see", async () => {
      const seesTheFlatOnly: Access = {
        kind: "scoped",
        narrowed: false,
        spaces: new Map([[unitId("flat"), "edit"]]),
      };

      expect((await spacesOf(seesTheFlatOnly))[2]).toEqual(["beas-backup", ["Bea flat"]]);
    });
  });
});
