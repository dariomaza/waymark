import { Role } from "@waymark/domain";
import { describe, expect, it } from "vitest";

import type { User } from "../auth/user.js";
import { InMemoryUserRepository } from "../auth/user-repository.fake.js";
import {
  IssuerNotFound,
  NoAdministratorToIssueFor,
  resolveMachineTokenIssuer,
} from "./machine-token-issuer.js";

const anAccount = (id: string, role: Role, createdAt: string): User => ({
  id,
  username: id,
  passwordHash: "scrypt$...",
  role,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
  disabledAt: null,
});

const HOUSE = [
  anAccount("partner", Role.USER, "2026-01-01T00:00:00.000Z"),
  anAccount("dario", Role.ADMINISTRATOR, "2026-02-01T00:00:00.000Z"),
  anAccount("second-admin", Role.ADMINISTRATOR, "2026-03-01T00:00:00.000Z"),
];

describe("whom a machine token from the shell belongs to (ADR 26)", () => {
  it("is the person --username names", async () => {
    const issuer = await resolveMachineTokenIssuer(
      new InMemoryUserRepository(HOUSE),
      "Partner",
    );

    expect(issuer.username).toBe("partner");
  });

  it("is the oldest administrator when nobody is named", async () => {
    const issuer = await resolveMachineTokenIssuer(
      new InMemoryUserRepository(HOUSE),
      null,
    );

    expect(issuer.username).toBe("dario");
  });

  it("refuses a username nobody has, naming it", async () => {
    await expect(
      resolveMachineTokenIssuer(new InMemoryUserRepository(HOUSE), "ghost"),
    ).rejects.toThrow(new IssuerNotFound("ghost").message);
  });

  it("refuses to guess when nobody is named and there is no administrator", async () => {
    const error = await resolveMachineTokenIssuer(
      new InMemoryUserRepository([]),
      null,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NoAdministratorToIssueFor);
    expect((error as Error).message).toMatch(/create-user/u);
  });
});
