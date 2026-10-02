import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

type Person = "admin" | "ana" | "bea";

interface ListedToken {
  readonly name: string;
  readonly issuedBy?: string;
}

const errorOf = (response: LightMyRequestResponse) => ({
  status: response.statusCode,
  code: (response.json() as { error: { code: string } }).error.code,
});

/**
 * # Whose machine tokens a person sees and manages (ADR 26)
 *
 * A token belongs to the person who issued it. People see and manage the
 * tokens they issued; an administrator sees and manages all of them, and reads
 * whose each one is. Anybody else asking about a token by name is answered as
 * if it did not exist, so the routes do not tell them which names are taken.
 *
 * Names stay unique across the house, so a name taken by somebody else is
 * still refused when creating one: that is the least a uniqueness rule can
 * say, and the refusal carries the name and nothing else of the token.
 */
describe("whose machine tokens each person sees and manages (ADR 26)", () => {
  let api: TestApi;
  const sessions = new Map<Person, string>();

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    // The first account is the administrator.
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    await api.createUser("ana", "anas-password");
    await api.createUser("bea", "beas-password");
    sessions.set("admin", await api.login());
    sessions.set("ana", await api.login("ana", "anas-password"));
    sessions.set("bea", await api.login("bea", "beas-password"));

    await api.createMachineToken("admins-backup", "read", undefined, TEST_USERNAME);
    await api.createMachineToken("anas-assistant", "read", undefined, "ana");
    await api.createMachineToken("beas-assistant", "read-write", undefined, "bea");
  });

  const as = (person: Person, options: InjectOptions): Promise<LightMyRequestResponse> =>
    api.app.inject({
      ...options,
      headers: { ...options.headers, ...api.authHeaders(sessions.get(person) ?? "") },
    });

  const listOf = async (person: Person): Promise<ListedToken[]> => {
    const response = await as(person, { method: "GET", url: "/auth/machine-tokens" });
    expect(response.statusCode).toBe(200);

    return (response.json() as { machineTokens: ListedToken[] }).machineTokens;
  };

  const rotate = (person: Person, name: string) =>
    as(person, { method: "POST", url: `/auth/machine-tokens/${name}/rotate`, payload: {} });

  const revoke = (person: Person, name: string) =>
    as(person, { method: "DELETE", url: `/auth/machine-tokens/${name}` });

  const stillThere = async (name: string): Promise<boolean> =>
    (await api.database.client.machineToken.findUnique({ where: { name } })) !== null;

  describe("GET /auth/machine-tokens", () => {
    it("lists for a person only the tokens they issued", async () => {
      expect((await listOf("ana")).map((token) => token.name)).toEqual(["anas-assistant"]);
      expect((await listOf("bea")).map((token) => token.name)).toEqual(["beas-assistant"]);
    });

    it("lists every token for the administrator, each with whose it is", async () => {
      expect(
        (await listOf("admin")).map((token) => [token.name, token.issuedBy]),
      ).toEqual([
        ["admins-backup", TEST_USERNAME],
        ["anas-assistant", "ana"],
        ["beas-assistant", "bea"],
      ]);
    });

    it("does not tell a person who issued their own tokens: it is them", async () => {
      const [anas] = await listOf("ana");

      expect(anas).not.toHaveProperty("issuedBy");
    });
  });

  describe("POST /auth/machine-tokens/:name/rotate", () => {
    it("rotates a token for the person who issued it", async () => {
      expect((await rotate("ana", "anas-assistant")).statusCode).toBe(200);
    });

    it("rotates anybody's token for the administrator", async () => {
      expect((await rotate("admin", "anas-assistant")).statusCode).toBe(200);
    });

    it("answers anybody else as if the token did not exist, and leaves it working", async () => {
      const secret = await api.createMachineToken("anas-other", "read", undefined, "ana");
      const unknown = errorOf(await rotate("bea", "never-issued"));

      const refused = await rotate("bea", "anas-other");

      expect(errorOf(refused)).toEqual(unknown);
      expect(refused.json()).toEqual({
        error: {
          code: "MACHINE_TOKEN_NOT_FOUND",
          message: 'There is no machine token named "anas-other"',
          details: { machineTokenName: "anas-other" },
        },
      });
      const stillWorks = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(secret),
      });
      expect(stillWorks.statusCode).toBe(200);
    });
  });

  describe("DELETE /auth/machine-tokens/:name", () => {
    it("revokes a token for the person who issued it", async () => {
      expect((await revoke("bea", "beas-assistant")).statusCode).toBe(204);
      expect(await stillThere("beas-assistant")).toBe(false);
    });

    it("revokes anybody's token for the administrator", async () => {
      expect((await revoke("admin", "beas-assistant")).statusCode).toBe(204);
      expect(await stillThere("beas-assistant")).toBe(false);
    });

    it("answers anybody else as if the token did not exist, and leaves it alone", async () => {
      const unknown = await revoke("ana", "never-issued");

      const refused = await revoke("ana", "beas-assistant");

      expect(errorOf(refused)).toEqual(errorOf(unknown));
      expect(await stillThere("beas-assistant")).toBe(true);
    });
  });

  describe("POST /auth/machine-tokens", () => {
    /**
     * Names are unique across the house (they are what the CLI revokes by), so
     * the refusal has to say the name is taken. It says nothing else: not
     * whose it is, not its scope, not when it was used.
     */
    it("refuses a name somebody else holds with the same conflict, naming only the name", async () => {
      const response = await as("ana", {
        method: "POST",
        url: "/auth/machine-tokens",
        payload: { name: "beas-assistant", scope: "read" },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json() as {
        error: { code: string; details: Record<string, unknown> };
      };
      expect(body.error.code).toBe("MACHINE_TOKEN_NAME_ALREADY_TAKEN");
      expect(body.error.details).toEqual({ machineTokenName: "beas-assistant" });
      expect(response.body).not.toContain("bea\"");
      expect(response.body).not.toContain("read-write");
    });
  });
});
