import {
  createStorageUnit,
  mayViewSpace,
  publicId,
  Role,
  ShareLevel,
  StorageUnitKind,
  unitId,
  userId,
  type Access,
  type ChosenSpaces,
  type UnitId,
  type UserId,
  WHOLE_REACH,
} from "@waymark/domain";
import {
  InMemoryShareRepository,
  InMemoryStorageUnitRepository,
} from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { AccessOfCaller } from "./access-of-caller.js";
import { InvalidMachineToken } from "./auth-errors.js";
import type { Caller } from "./caller.js";
import { MachineTokenScope } from "./machine-token.js";
import { SessionOpener } from "./session.js";
import type { User } from "./user.js";
import { InMemoryUserRepository } from "./user-repository.fake.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");

const aUser = (id: string, role: Role): User => ({
  id,
  username: id,
  passwordHash: "scrypt$...",
  role,
  createdAt: NOW,
  updatedAt: NOW,
  disabledAt: null,
  mustChangePassword: false,
});

const ADMIN = aUser("admin", Role.ADMINISTRATOR);
const ANA = aUser("ana", Role.USER);
const BEA = aUser("bea", Role.USER);

const signedIn = (user: User): Caller => ({
  kind: "user",
  user,
  session: {
    id: `session-${user.id}`,
    tokenHash: "hash",
    userId: user.id,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 1000),
    createdWith: SessionOpener.Password,
  },
});

const aMachineIssuedBy = (
  issuer: string,
  chosenSpaces: ChosenSpaces = WHOLE_REACH,
): Caller => ({
  kind: "machine",
  machineToken: {
    id: `token-${issuer}`,
    name: "mcp-server",
    tokenHash: "hash",
    scope: MachineTokenScope.Read,
    userId: issuer,
    createdAt: NOW,
    expiresAt: null,
    lastUsedAt: null,
    chosenSpaces,
  },
});

const aSpace = (id: string, parentId: UnitId | null, owner: UserId | null) =>
  createStorageUnit({
    id: unitId(id),
    parentId,
    ownerId: owner,
    name: id,
    kind: StorageUnitKind.ROOM,
    publicId: publicId(`PUB-${id}`),
    now: NOW,
  });

/** The ids a caller may see, sorted, so a case reads as a list of spaces. */
const visible = (access: Access, among: readonly string[]): string[] =>
  among.filter((id) => mayViewSpace(access, unitId(id))).sort();

const EVERY_SPACE = ["ana-house", "ana-garage", "bea-flat"];

describe("the access a request acts with (ADR 26)", () => {
  let accessOf: AccessOfCaller;

  beforeEach(async () => {
    const storageUnits = new InMemoryStorageUnitRepository([
      aSpace("ana-house", null, userId(ANA.id)),
      aSpace("ana-garage", unitId("ana-house"), null),
      aSpace("bea-flat", null, userId(BEA.id)),
    ]);
    const shares = new InMemoryShareRepository();
    await shares.set({
      storageUnitId: unitId("ana-garage"),
      userId: userId(BEA.id),
      access: ShareLevel.VIEW,
    });

    accessOf = new AccessOfCaller({
      users: new InMemoryUserRepository([ADMIN, ANA, BEA]),
      storageUnits,
      shares,
    });
  });

  it("lets an administrator see everything", async () => {
    await expect(accessOf.execute(signedIn(ADMIN))).resolves.toEqual({
      kind: "everything",
    });
  });

  it("lets a person see what they own and nothing of anybody else's", async () => {
    const access = await accessOf.execute(signedIn(ANA));

    expect(visible(access, EVERY_SPACE)).toEqual(["ana-garage", "ana-house"]);
  });

  it("lets a person see what was shared with them as well as their own", async () => {
    const access = await accessOf.execute(signedIn(BEA));

    expect(visible(access, EVERY_SPACE)).toEqual(["ana-garage", "bea-flat"]);
  });

  it("gives a machine token exactly what its issuer sees, never more", async () => {
    const access = await accessOf.execute(aMachineIssuedBy(BEA.id));

    expect(visible(access, EVERY_SPACE)).toEqual(["ana-garage", "bea-flat"]);
  });

  it("gives a token an administrator issued everything, as its issuer has", async () => {
    await expect(accessOf.execute(aMachineIssuedBy(ADMIN.id))).resolves.toEqual({
      kind: "everything",
    });
  });

  it("refuses a token whose issuer has no account, rather than guessing", async () => {
    await expect(
      accessOf.execute(aMachineIssuedBy("nobody")),
    ).rejects.toBeInstanceOf(InvalidMachineToken);
  });

  describe("a machine token narrowed to chosen spaces", () => {
    const narrowedTo = (...ids: string[]): ChosenSpaces => ({
      narrowed: true,
      spaceIds: ids.map(unitId),
    });

    it("reaches only the chosen spaces its issuer reaches", async () => {
      const access = await accessOf.execute(aMachineIssuedBy(BEA.id, narrowedTo("ana-garage")));

      expect(visible(access, EVERY_SPACE)).toEqual(["ana-garage"]);
    });

    it("reaches nothing of a chosen space its issuer cannot reach", async () => {
      const access = await accessOf.execute(aMachineIssuedBy(BEA.id, narrowedTo("ana-house")));

      expect(visible(access, EVERY_SPACE)).toEqual(["ana-garage"]);
    });

    it("narrows an administrator's token too, rather than seeing everything", async () => {
      const access = await accessOf.execute(aMachineIssuedBy(ADMIN.id, narrowedTo("bea-flat")));

      expect(visible(access, EVERY_SPACE)).toEqual(["bea-flat"]);
    });

    it("reaches nothing once the chosen spaces are gone", async () => {
      const access = await accessOf.execute(aMachineIssuedBy(ANA.id, narrowedTo()));

      expect(visible(access, EVERY_SPACE)).toEqual([]);
    });
  });
});
