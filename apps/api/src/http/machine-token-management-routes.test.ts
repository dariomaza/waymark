import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { looksLikeMachineToken } from "../auth/machine-token-secret.js";
import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

/**
 * # Managing machine tokens from a browser, which ADR 17 said would never happen
 *
 * It said so for a good reason — "an endpoint that mints a LONG-LIVED
 * credential on an internet-facing inventory is a door that does not close by
 * itself" — and ADR 18 reopens it with the one thing that was missing from
 * that sentence: WHO is allowed through. These four routes are behind a
 * person's session, which is itself revocable, rate limited and password
 * backed. The door is no longer self-service; it is a door with a person on
 * the other side of it.
 *
 * ## The question this file actually settles
 *
 * May a machine token manage machine tokens? No, and the refusals are two
 * different ones on purpose.
 *
 * A READ-scoped token never reaches these routes at all: a create, a rotate
 * and a revoke are writes, so the scope hook in `build-app.ts` refuses them
 * with `READ_ONLY_MACHINE_TOKEN` before the body is parsed. That is ADR 17
 * working exactly as written, and it means a read key cannot mint a writing
 * one — the objection that makes "read-only" mean something.
 *
 * A READ-WRITE token passes that hook and is refused by the route, with
 * `MACHINE_TOKEN_CANNOT_MANAGE_MACHINE_TOKENS`. That refusal is the one worth
 * arguing, and the argument is revocation: a credential that can issue its own
 * successor cannot be revoked. Kill `mcp-server` and whoever holds it still
 * has `mcp-server-2`, minted last Tuesday, indistinguishable in the list from
 * one a person made. ADR 17's entire promise is a credential that can be
 * killed without touching a human account, and self-succession silently
 * withdraws it.
 *
 * Listing is refused to machines too, and that one is not about writes at all:
 * `GET` sails through the scope hook, so without a check of its own a
 * read-only MCP token could enumerate every credential in the house — every
 * name, every scope, and when each was last used. That is reconnaissance, and
 * it is exactly the shape of thing a token issued to answer "where is the
 * drill" has no business asking.
 */
describe("managing machine tokens over HTTP", () => {
  let api: TestApi;
  let session: string;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    session = await api.login();
  });

  const list = async (): Promise<{
    machineTokens: { name: string; scope: string; lastUsedAt: string | null }[];
  }> =>
    (
      await api.app.inject({
        method: "GET",
        url: "/auth/machine-tokens",
        headers: api.authHeaders(session),
      })
    ).json();

  const create = async (
    payload: Record<string, unknown>,
    headers = api.authHeaders(session),
  ) =>
    await api.app.inject({
      method: "POST",
      url: "/auth/machine-tokens",
      headers,
      payload,
    });

  describe("listing what exists", () => {
    it("answers an empty list before anything has been issued", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/auth/machine-tokens",
        headers: api.authHeaders(session),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ machineTokens: [] });
    });

    it("names every token, its scope, when it was made and when it was last used", async () => {
      await api.createMachineToken("mcp-server", "read");

      const { machineTokens } = await list();

      expect(machineTokens).toHaveLength(1);
      expect(machineTokens[0]).toMatchObject({
        name: "mcp-server",
        scope: "read",
        lastUsedAt: null,
      });
      expect(machineTokens[0]).toHaveProperty("createdAt");
      expect(machineTokens[0]).toHaveProperty("expiresAt");
    });

    /**
     * The one thing a list of credentials must never carry. There is no secret
     * to leak — it was never stored — but the HASH is stored, and a hash in a
     * list is a hash in a browser's memory, a service worker's cache and
     * somebody's screenshot.
     */
    it("never carries the hash, and cannot carry the secret", async () => {
      const token = await api.createMachineToken("mcp-server", "read");
      const hash = await api.machineTokenHashOf("mcp-server");

      const body = JSON.stringify(await list());

      expect(body).not.toContain(hash);
      expect(body).not.toContain(token);
      expect(body).not.toContain("tokenHash");
    });

    it("shows a token being used, which is the column somebody came for", async () => {
      const token = await api.createMachineToken("mcp-server", "read");
      await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });

      const { machineTokens } = await list();

      expect(machineTokens[0]?.lastUsedAt).not.toBeNull();
    });
  });

  describe("creating one", () => {
    it("answers 201 with the secret, exactly once", async () => {
      const response = await create({ name: "mcp-server", scope: "read" });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { token: string; machineToken: { name: string } };
      expect(looksLikeMachineToken(body.token)).toBe(true);
      expect(body.machineToken.name).toBe("mcp-server");
    });

    /**
     * The secret is gone the moment that response is sent. Nothing stores it,
     * so nothing can hand it back — which is the property, not a limitation.
     */
    it("cannot be asked for the secret again", async () => {
      const { token } = (await create({ name: "mcp-server", scope: "read" })).json() as {
        token: string;
      };

      expect(JSON.stringify(await list())).not.toContain(token);
    });

    it("issues a token that actually opens the inventory", async () => {
      const { token } = (await create({ name: "mcp-server", scope: "read" })).json() as {
        token: string;
      };

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("issues a read key that is refused a write, which is the whole point of the scope", async () => {
      const { token } = (await create({ name: "mcp-server", scope: "read" })).json() as {
        token: string;
      };

      const response = await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.machineHeaders(token),
        payload: { name: "Shed", kind: "ROOM" },
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "READ_ONLY_MACHINE_TOKEN",
      );
    });

    it("issues a read-write key that may write", async () => {
      const { token } = (
        await create({ name: "filer", scope: "read-write" })
      ).json() as { token: string };

      const response = await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.machineHeaders(token),
        payload: { name: "Shed", kind: "ROOM" },
      });

      expect(response.statusCode).toBe(201);
    });

    it("takes an expiry in days", async () => {
      const response = await create({
        name: "filer",
        scope: "read-write",
        expiresInDays: 90,
      });

      expect(
        (response.json() as { machineToken: { expiresAt: string | null } }).machineToken
          .expiresAt,
      ).not.toBeNull();
    });

    /**
     * 409, not 422: the bytes are fine and the world is what has to change —
     * revoke the other one, or pick another name (ADR 8).
     */
    it("refuses a name already taken with 409", async () => {
      await create({ name: "mcp-server", scope: "read" });

      const response = await create({ name: "mcp-server", scope: "read" });

      expect(response.statusCode).toBe(409);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "MACHINE_TOKEN_NAME_ALREADY_TAKEN",
      );
    });

    /**
     * 422: fix the request, then retry (ADR 8). The name has to survive being
     * typed into a shell, which is what `machine-token revoke --name` does
     * with it.
     */
    it("refuses a name nobody could type into a shell with 422", async () => {
      const response = await create({ name: "mcp server!", scope: "read" });

      expect(response.statusCode).toBe(422);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "INVALID_MACHINE_TOKEN_NAME",
      );
    });

    it("refuses a scope that is not one of the two, before anything is stored", async () => {
      const response = await create({ name: "mcp-server", scope: "admin" });

      expect(response.statusCode).toBe(400);
      expect((await list()).machineTokens).toHaveLength(0);
    });

    it("refuses a body that names a field nobody meant", async () => {
      const response = await create({
        name: "mcp-server",
        scope: "read",
        userId: "u1",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("rotating one", () => {
    it("hands back a new secret for the same name and scope", async () => {
      await create({ name: "mcp-server", scope: "read" });

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/machine-tokens/mcp-server/rotate",
        headers: api.authHeaders(session),
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        token: string;
        machineToken: { name: string; scope: string };
      };
      expect(looksLikeMachineToken(body.token)).toBe(true);
      expect(body.machineToken).toMatchObject({ name: "mcp-server", scope: "read" });
    });

    it("kills the old secret, which is the reason anybody rotates", async () => {
      const { token: before } = (
        await create({ name: "mcp-server", scope: "read" })
      ).json() as { token: string };

      await api.app.inject({
        method: "POST",
        url: "/auth/machine-tokens/mcp-server/rotate",
        headers: api.authHeaders(session),
        payload: {},
      });

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(before),
      });

      expect(response.statusCode).toBe(401);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "INVALID_MACHINE_TOKEN",
      );
    });

    it("makes the new secret work immediately", async () => {
      await create({ name: "mcp-server", scope: "read" });

      const { token } = (
        await api.app.inject({
          method: "POST",
          url: "/auth/machine-tokens/mcp-server/rotate",
          headers: api.authHeaders(session),
          payload: {},
        })
      ).json() as { token: string };

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("leaves one token where there was one, never two", async () => {
      await create({ name: "mcp-server", scope: "read" });

      await api.app.inject({
        method: "POST",
        url: "/auth/machine-tokens/mcp-server/rotate",
        headers: api.authHeaders(session),
        payload: {},
      });

      expect((await list()).machineTokens).toHaveLength(1);
    });

    it("says there was nothing to rotate rather than inventing a credential", async () => {
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/machine-tokens/never-issued/rotate",
        headers: api.authHeaders(session),
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "MACHINE_TOKEN_NOT_FOUND",
      );
    });
  });

  describe("revoking one", () => {
    it("answers 204 and the secret stops working on the next request", async () => {
      const { token } = (
        await create({ name: "mcp-server", scope: "read" })
      ).json() as { token: string };

      const revoked = await api.app.inject({
        method: "DELETE",
        url: "/auth/machine-tokens/mcp-server",
        headers: api.authHeaders(session),
      });

      expect(revoked.statusCode).toBe(204);
      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });
      expect(response.statusCode).toBe(401);
    });

    it("takes exactly one, never the rest", async () => {
      await create({ name: "mcp-server", scope: "read" });
      await create({ name: "backup", scope: "read-write" });

      await api.app.inject({
        method: "DELETE",
        url: "/auth/machine-tokens/mcp-server",
        headers: api.authHeaders(session),
      });

      expect((await list()).machineTokens.map((token) => token.name)).toEqual([
        "backup",
      ]);
    });

    /**
     * There is no route that revokes everything, for the reason the CLI parser
     * gives: the one time somebody reaches for it is in a panic, and the blast
     * radius is every machine in the house at once.
     */
    it("has no route that revokes everything", async () => {
      const response = await api.app.inject({
        method: "DELETE",
        url: "/auth/machine-tokens",
        headers: api.authHeaders(session),
      });

      expect(response.statusCode).toBe(404);
    });

    it("says there was nothing to revoke rather than reporting success at a typo", async () => {
      const response = await api.app.inject({
        method: "DELETE",
        url: "/auth/machine-tokens/never-issued",
        headers: api.authHeaders(session),
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "MACHINE_TOKEN_NOT_FOUND",
      );
    });
  });

  /**
   * # A person, and only a person
   *
   * See this file's opening comment for the argument. These are the cases that
   * hold it.
   */
  describe("who may do any of this", () => {
    it("refuses somebody with no credential at all", async () => {
      for (const [method, url] of [
        ["GET", "/auth/machine-tokens"],
        ["POST", "/auth/machine-tokens"],
        ["POST", "/auth/machine-tokens/mcp-server/rotate"],
        ["DELETE", "/auth/machine-tokens/mcp-server"],
      ] as const) {
        const response = await api.app.inject({ method, url });

        expect(response.statusCode).toBe(401);
      }
    });

    /**
     * The scope hook, not the route. A create is a `POST`, so a read-only key
     * is refused before the body is parsed and before any use case runs — so
     * the refusal provably cannot have minted anything.
     */
    it("refuses a read-only machine token before the route is even reached", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await create({ name: "sneaky", scope: "read-write" }, {
        ...api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "READ_ONLY_MACHINE_TOKEN",
      );
      expect((await list()).machineTokens.map((entry) => entry.name)).toEqual([
        "mcp-server",
      ]);
    });

    /**
     * The refusal that is this feature's own, rather than ADR 17's. A
     * read-write token passes the scope hook and is refused anyway, because a
     * credential that can issue its own successor cannot be revoked.
     */
    it("refuses a read-write machine token, which the scope hook lets through", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await create({ name: "successor", scope: "read-write" }, {
        ...api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "MACHINE_TOKEN_CANNOT_MANAGE_MACHINE_TOKENS",
      );
      expect((await list()).machineTokens.map((entry) => entry.name)).toEqual([
        "filer",
      ]);
    });

    it("refuses a machine token the LIST, which no scope would have stopped", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/machine-tokens",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "MACHINE_TOKEN_CANNOT_MANAGE_MACHINE_TOKENS",
      );
    });

    it("refuses a machine token a rotation, so it cannot renew itself forever", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/machine-tokens/filer/rotate",
        headers: api.machineHeaders(token),
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "MACHINE_TOKEN_CANNOT_MANAGE_MACHINE_TOKENS",
      );
    });

    /**
     * The mirror of the one above, and the reason it is not merely symmetry:
     * a compromised machine that could revoke ITSELF could cover its tracks,
     * and one with a bug could disappear at three in the morning in a way
     * nobody could tell from being switched off. `POST /auth/logout` already
     * refuses a machine caller for exactly this; revocation is the same act.
     */
    it("refuses a machine token the ability to revoke, including itself", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "DELETE",
        url: "/auth/machine-tokens/filer",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
      expect((await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      })).statusCode).toBe(200);
    });

    /** The CLI is unchanged and still the way a first token is made. */
    it("leaves the shell able to do all of it, which is how a fresh install starts", async () => {
      await api.createMachineToken("from-a-shell", "read");

      expect(await api.revokeMachineToken("from-a-shell")).toBe(true);
    });
  });
});
