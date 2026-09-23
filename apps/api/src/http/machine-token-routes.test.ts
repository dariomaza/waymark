import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LAST_USED_GRANULARITY_MS } from "../auth/machine-token.js";
import { CLOUDFLARE_CLIENT_IP_HEADER } from "./client-ip.js";
import {
  LOGIN_ATTEMPT_LIMIT,
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

const DAY = 24 * 60 * 60 * 1000;

describe("machine tokens over HTTP", () => {
  let api: TestApi;
  let unitId: string;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);

    // One unit to read and to try to change, created by a person, so every
    // case below is about the credential rather than about an empty database.
    const session = await api.login();
    const created = await api.app.inject({
      method: "POST",
      url: "/storage-units",
      headers: api.authHeaders(session),
      payload: { name: "Garage", kind: "ROOM" },
    });
    unitId = (created.json() as { unit: { id: string } }).unit.id;
  });

  describe("a token that is live", () => {
    it("opens the inventory", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("reads one unit, which is what an assistant is for", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: `/storage-units/${unitId}`,
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { unit: { name: string } }).unit.name).toBe(
        "Garage",
      );
    });

    it("searches, which is the question the whole product answers", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/search?q=gar",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("says who it is, and never what it is hashed as", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        machineToken: { name: "mcp-server", scope: "read" },
      });
    });
  });

  describe("a read-only token asked to change something", () => {
    it("is refused with 403, not 409 and not 422", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.machineHeaders(token),
        payload: { name: "Shed", kind: "ROOM" },
      });

      // Neither of ADR 8's two codes. 409 is "fix the world, then retry" and
      // 422 is "fix the request, then retry"; both would be advice this caller
      // cannot act on, because the bytes and the world are already fine. What
      // has to change is the credential.
      expect(response.statusCode).toBe(403);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "READ_ONLY_MACHINE_TOKEN",
      );
    });

    it("changes nothing, because it is refused before any use case runs", async () => {
      const token = await api.createMachineToken("mcp-server", "read");
      const before = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });

      await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.machineHeaders(token),
        payload: { name: "Shed", kind: "ROOM" },
      });

      const after = await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });
      expect(after.body).toBe(before.body);
    });

    it("is refused a write whose body would not have validated either", async () => {
      // The credential is checked BEFORE the schema, so a read-only token
      // learns nothing about the shape of a route it may not call.
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.machineHeaders(token),
        payload: { nonsense: true },
      });

      expect(response.statusCode).toBe(403);
    });

    it.each([
      ["POST", "/items", { storageUnitId: "x", name: "Drill" }],
      ["PATCH", "/items/whatever", { name: "Drill" }],
      ["DELETE", "/items/whatever", undefined],
      ["POST", "/photos/processing/retry", undefined],
    ])("is refused %s %s", async (method, url, payload) => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: method as "POST",
        url,
        headers: api.machineHeaders(token),
        ...(payload === undefined ? {} : { payload }),
      });

      expect(response.statusCode).toBe(403);
    });

    it("is still allowed every read", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      for (const url of ["/storage-units", "/items", "/search?q=gar"]) {
        const response = await api.app.inject({
          method: "GET",
          url,
          headers: api.machineHeaders(token),
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe("a read-write token", () => {
    it("may create a unit", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.machineHeaders(token),
        payload: { name: "Shed", kind: "ROOM" },
      });

      expect(response.statusCode).toBe(201);
    });

    it("may file an item away", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "POST",
        url: "/items",
        headers: api.machineHeaders(token),
        payload: { storageUnitId: unitId, name: "Cordless drill" },
      });

      expect(response.statusCode).toBe(201);
    });

    it("still meets the domain's own refusals, which are not about credentials", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "POST",
        url: "/items",
        headers: api.machineHeaders(token),
        payload: { storageUnitId: "no-such-unit", name: "Drill" },
      });

      // 422, exactly as it is for a person: the scope let the request through
      // and the domain refused it on its merits (ADR 8).
      expect(response.statusCode).toBe(422);
    });
  });

  describe("a token that should not work", () => {
    it("refuses one nobody was issued", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders("wmk_made-up-entirely"),
      });

      expect(response.statusCode).toBe(401);
    });

    it("refuses a revoked one on the very next request", async () => {
      const token = await api.createMachineToken("mcp-server", "read");
      const before = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });
      expect(before.statusCode).toBe(200);

      await api.revokeMachineToken("mcp-server");

      const after = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });
      expect(after.statusCode).toBe(401);
    });

    it("refuses an expired one", async () => {
      const token = await api.createMachineToken("mcp-server", "read", 30);
      api.clock.advanceBy(31 * DAY);

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(401);
    });

    it("keeps a token with no expiry working for as long as it is left alone", async () => {
      const token = await api.createMachineToken("mcp-server", "read");
      api.clock.advanceBy(900 * DAY);

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it("revokes one machine without touching a person's session", async () => {
      const session = await api.login();
      const token = await api.createMachineToken("mcp-server", "read");

      await api.revokeMachineToken("mcp-server");

      const person = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(session),
      });
      expect(person.statusCode).toBe(200);

      const machine = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });
      expect(machine.statusCode).toBe(401);
    });

    it("revokes one machine without touching another", async () => {
      const reader = await api.createMachineToken("mcp-server", "read");
      const writer = await api.createMachineToken("filer", "read-write");

      await api.revokeMachineToken("mcp-server");

      expect(
        (
          await api.app.inject({
            method: "GET",
            url: "/auth/me",
            headers: api.machineHeaders(writer),
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await api.app.inject({
            method: "GET",
            url: "/auth/me",
            headers: api.machineHeaders(reader),
          })
        ).statusCode,
      ).toBe(401);
    });
  });

  /**
   * The property the separate scheme exists for. A leak of either credential
   * must not be replayable as the other.
   */
  describe("the two credentials are not interchangeable", () => {
    it("refuses a session token presented as a machine token", async () => {
      const session = await api.login();

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(session),
      });

      expect(response.statusCode).toBe(401);
    });

    it("refuses a machine token presented as a bearer token", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(token),
      });

      expect(response.statusCode).toBe(401);
    });

    it("refuses a read-write machine token presented as a bearer token", async () => {
      // Scope is not what stops this. The scheme is.
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.authHeaders(token),
        payload: { name: "Shed", kind: "ROOM" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("leaves a person's bearer session working exactly as it did", async () => {
      const session = await api.login();

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.authHeaders(session),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ user: { username: TEST_USERNAME } });
    });

    it("refuses a machine token under a scheme that is neither", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Basic ${token}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it("cannot log a machine token out, because revocation is a shell command", async () => {
      const token = await api.createMachineToken("filer", "read-write");

      const response = await api.app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: api.machineHeaders(token),
      });

      expect(response.statusCode).toBe(403);
      // And it is still live: a refused logout must not half-revoke anything.
      expect(
        (
          await api.app.inject({
            method: "GET",
            url: "/auth/me",
            headers: api.machineHeaders(token),
          })
        ).statusCode,
      ).toBe(200);
    });
  });

  describe("the hash never leaves the server", () => {
    it("is absent from /auth/me", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(response.body).not.toContain("tokenHash");
      expect(response.body).not.toContain(await api.machineTokenHashOf("mcp-server"));
    });

    it("is absent from the token itself being echoed anywhere", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(response.body).not.toContain(token);
    });

    it("is absent from a refusal, which is where a leak would be least noticed", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "POST",
        url: "/storage-units",
        headers: api.machineHeaders(token),
        payload: { name: "Shed", kind: "ROOM" },
      });

      expect(response.body).not.toContain(token);
      expect(response.body).not.toContain(await api.machineTokenHashOf("mcp-server"));
    });
  });

  describe("recording that a token is in use", () => {
    it("stamps it the first time it is presented", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(await api.lastUsedAtOf("mcp-server")).toEqual(api.clock.now());
    });

    it("shows it on /auth/me, so an admin can see the thing is alive", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      const response = await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(
        (response.json() as { machineToken: { lastUsedAt: string } }).machineToken
          .lastUsedAt,
      ).toBe(api.clock.now().toISOString());
    });

    it("does not write once per request, which is what a machine would cost", async () => {
      const token = await api.createMachineToken("mcp-server", "read");
      await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });
      const first = await api.lastUsedAtOf("mcp-server");

      api.clock.advanceBy(LAST_USED_GRANULARITY_MS - 1000);
      for (let request = 0; request < 5; request += 1) {
        await api.app.inject({
          method: "GET",
          url: "/storage-units",
          headers: api.machineHeaders(token),
        });
      }

      expect(await api.lastUsedAtOf("mcp-server")).toEqual(first);
    });

    it("writes again once the token has been quiet for long enough", async () => {
      const token = await api.createMachineToken("mcp-server", "read");
      await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      api.clock.advanceBy(LAST_USED_GRANULARITY_MS);
      await api.app.inject({
        method: "GET",
        url: "/storage-units",
        headers: api.machineHeaders(token),
      });

      expect(await api.lastUsedAtOf("mcp-server")).toEqual(api.clock.now());
    });

    it("never stamps a token it refused", async () => {
      const token = await api.createMachineToken("mcp-server", "read", 1);
      api.clock.advanceBy(2 * DAY);

      await api.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: api.machineHeaders(token),
      });

      expect(await api.lastUsedAtOf("mcp-server")).toBeNull();
    });
  });

  /**
   * ADR 7 put the login limiter there to make password GUESSING expensive. A
   * machine token does not log in and cannot be guessed, and it is the one
   * caller that legitimately makes hundreds of requests a minute.
   */
  describe("the login limiter", () => {
    it("does not count a machine token's requests at all", async () => {
      const token = await api.createMachineToken("mcp-server", "read");

      for (let request = 0; request < LOGIN_ATTEMPT_LIMIT * 4; request += 1) {
        const response = await api.app.inject({
          method: "GET",
          url: "/storage-units",
          headers: {
            ...api.machineHeaders(token),
            [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.9",
          },
        });
        expect(response.statusCode).toBe(200);
      }
    });

    it("does not count a refused machine token as a failed login", async () => {
      for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT * 2; attempt += 1) {
        await api.app.inject({
          method: "GET",
          url: "/auth/me",
          headers: {
            authorization: "Machine wmk_wrong",
            [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.9",
          },
        });
      }

      // The person behind that address can still log in: a machine's bad
      // credential is not evidence about a human's password.
      const response = await api.app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.9" },
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
