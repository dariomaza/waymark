import { Role } from "@waymark/domain";
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

const aToken = (name: string, userId: string): MachineToken => ({
  id: `${name}-id`,
  name,
  tokenHash: `${name}-hash`,
  scope: MachineTokenScope.Read,
  userId,
  createdAt: A_MOMENT,
  expiresAt: null,
  lastUsedAt: null,
});

describe("listing machine tokens (ADR 26)", () => {
  let listMachineTokens: ListMachineTokens;

  beforeEach(() => {
    listMachineTokens = new ListMachineTokens({
      machineTokens: new InMemoryMachineTokenRepository([
        aToken("anas-assistant", "ana"),
        aToken("beas-assistant", "bea"),
        aToken("beas-backup", "bea"),
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
    });

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
    });

    expect(namesAndIssuers(listed)).toEqual([
      ["anas-assistant", "ana-name"],
      ["beas-assistant", "bea-name"],
      ["beas-backup", "bea-name"],
    ]);
  });

  it("lists every token for the shell, with the issuer too", async () => {
    expect(namesAndIssuers(await listMachineTokens.execute(THE_SHELL))).toHaveLength(3);
  });
});
