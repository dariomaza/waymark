import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ApiError } from "./api-error.js";
import { MachineTokenScope } from "./contract.js";
import { queryKeys } from "./query-keys.js";
import { createWaymarkClient } from "./waymark-client.js";

/**
 * # The four calls the account screen makes
 *
 * ADR 18 put routes in front of the machine-token use cases, behind a person's
 * session. This is the client's half of that contract, run against MSW
 * answering the way `apps/api` does — so a shape that would break the account
 * sheet breaks here first, and does so without a browser.
 *
 * The secret is the one thing worth being careful about in this file. It comes
 * back on exactly two calls, it is never in a list, and nothing in this package
 * writes it anywhere.
 */
const API_URL = "http://127.0.0.1:3000";

const apiServer = setupServer();

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  apiServer.resetHandlers();
});
afterAll(() => {
  apiServer.close();
});

const client = () =>
  createWaymarkClient<File>({
    baseUrl: API_URL,
    token: () => "a-live-token",
    appendPhoto: (form, field, file) => {
      form.append(field, file, file.name);
    },
  });

const aMachineTokenView = (overrides: Record<string, unknown> = {}) => ({
  id: "mt1",
  name: "mcp-server",
  scope: MachineTokenScope.Read,
  createdAt: "2026-04-01T10:00:00.000Z",
  expiresAt: null,
  lastUsedAt: null,
  ...overrides,
});

describe("managing machine tokens from a client", () => {
  describe("listing them", () => {
    it("asks the route a person's session may read", async () => {
      const seen: string[] = [];
      apiServer.use(
        http.get(`${API_URL}/auth/machine-tokens`, ({ request }) => {
          seen.push(new URL(request.url).pathname);
          return HttpResponse.json({ machineTokens: [aMachineTokenView()] });
        }),
      );

      const { machineTokens } = await client().machineTokens();

      expect(seen).toEqual(["/auth/machine-tokens"]);
      expect(machineTokens[0]?.name).toBe("mcp-server");
    });

    it("carries the four things a person came to read", async () => {
      apiServer.use(
        http.get(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json({
            machineTokens: [
              aMachineTokenView({
                scope: MachineTokenScope.ReadWrite,
                lastUsedAt: "2026-04-02T09:00:00.000Z",
                expiresAt: "2026-07-01T10:00:00.000Z",
              }),
            ],
          }),
        ),
      );

      const [token] = (await client().machineTokens()).machineTokens;

      expect(token).toMatchObject({
        name: "mcp-server",
        scope: "read-write",
        createdAt: "2026-04-01T10:00:00.000Z",
        lastUsedAt: "2026-04-02T09:00:00.000Z",
      });
    });

    it("carries an empty list rather than nothing at all", async () => {
      apiServer.use(
        http.get(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json({ machineTokens: [] }),
        ),
      );

      expect((await client().machineTokens()).machineTokens).toEqual([]);
    });
  });

  describe("creating one", () => {
    it("sends the name and the scope, and nothing else", async () => {
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(
            { token: "wmk_secret", machineToken: aMachineTokenView() },
            { status: 201 },
          );
        }),
      );

      await client().createMachineToken({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      expect(body).toEqual({ name: "mcp-server", scope: "read" });
    });

    it("sends an expiry when one was chosen", async () => {
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(
            { token: "wmk_secret", machineToken: aMachineTokenView() },
            { status: 201 },
          );
        }),
      );

      await client().createMachineToken({
        name: "filer",
        scope: MachineTokenScope.ReadWrite,
        expiresInDays: 90,
      });

      expect(body).toEqual({
        name: "filer",
        scope: "read-write",
        expiresInDays: 90,
      });
    });

    /**
     * The one call whose answer holds a secret. It is handed straight back to
     * the caller and nothing in this package keeps a reference to it.
     */
    it("hands back the secret with the token it describes", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json(
            { token: "wmk_the-only-copy", machineToken: aMachineTokenView() },
            { status: 201 },
          ),
        ),
      );

      const created = await client().createMachineToken({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      expect(created.token).toBe("wmk_the-only-copy");
      expect(created.machineToken.name).toBe("mcp-server");
    });

    it("passes the API's refusal of a taken name through as a 409", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json(
            {
              error: {
                code: "MACHINE_TOKEN_NAME_ALREADY_TAKEN",
                message: 'A machine token named "mcp-server" already exists',
              },
            },
            { status: 409 },
          ),
        ),
      );

      await expect(
        client().createMachineToken({
          name: "mcp-server",
          scope: MachineTokenScope.Read,
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: "MACHINE_TOKEN_NAME_ALREADY_TAKEN",
      });
    });

    it("passes the API's refusal of an untypeable name through as a 422", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json(
            { error: { code: "INVALID_MACHINE_TOKEN_NAME", message: "no" } },
            { status: 422 },
          ),
        ),
      );

      const refusal = await client()
        .createMachineToken({ name: "mcp server", scope: MachineTokenScope.Read })
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(ApiError);
      expect((refusal as ApiError).code).toBe("INVALID_MACHINE_TOKEN_NAME");
    });
  });

  describe("rotating one", () => {
    it("names the token in the path and sends no scope", async () => {
      const seen: string[] = [];
      let body: unknown;
      apiServer.use(
        http.post(
          `${API_URL}/auth/machine-tokens/:name/rotate`,
          async ({ request }) => {
            seen.push(new URL(request.url).pathname);
            body = await request.json();
            return HttpResponse.json({
              token: "wmk_next",
              machineToken: aMachineTokenView(),
            });
          },
        ),
      );

      await client().rotateMachineToken("mcp-server");

      expect(seen).toEqual(["/auth/machine-tokens/mcp-server/rotate"]);
      // No scope, ever: rotating must not be a way to widen a key.
      expect(body).toEqual({});
    });

    it("hands back the new secret", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens/:name/rotate`, () =>
          HttpResponse.json({
            token: "wmk_next",
            machineToken: aMachineTokenView(),
          }),
        ),
      );

      expect((await client().rotateMachineToken("mcp-server")).token).toBe(
        "wmk_next",
      );
    });

    it("sends a fresh expiry when one was chosen", async () => {
      let body: unknown;
      apiServer.use(
        http.post(
          `${API_URL}/auth/machine-tokens/:name/rotate`,
          async ({ request }) => {
            body = await request.json();
            return HttpResponse.json({
              token: "wmk_next",
              machineToken: aMachineTokenView(),
            });
          },
        ),
      );

      await client().rotateMachineToken("mcp-server", { expiresInDays: 30 });

      expect(body).toEqual({ expiresInDays: 30 });
    });

    it("escapes a name rather than pasting it into a URL", async () => {
      const seen: string[] = [];
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens/:name/rotate`, ({ request }) => {
          seen.push(new URL(request.url).pathname);
          return HttpResponse.json({
            token: "wmk_next",
            machineToken: aMachineTokenView(),
          });
        }),
      );

      await client().rotateMachineToken("a/b");

      expect(seen).toEqual(["/auth/machine-tokens/a%2Fb/rotate"]);
    });
  });

  describe("revoking one", () => {
    it("deletes exactly the name it was given", async () => {
      const seen: { method: string; pathname: string }[] = [];
      apiServer.use(
        http.delete(`${API_URL}/auth/machine-tokens/:name`, ({ request }) => {
          seen.push({
            method: request.method,
            pathname: new URL(request.url).pathname,
          });
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await client().revokeMachineToken("mcp-server");

      expect(seen).toEqual([
        { method: "DELETE", pathname: "/auth/machine-tokens/mcp-server" },
      ]);
    });

    it("reads nothing back, because 204 has no body", async () => {
      apiServer.use(
        http.delete(`${API_URL}/auth/machine-tokens/:name`, () =>
          new HttpResponse(null, { status: 204 }),
        ),
      );

      await expect(client().revokeMachineToken("mcp-server")).resolves.toBeUndefined();
    });

    it("passes a 404 through rather than reporting success at a typo", async () => {
      apiServer.use(
        http.delete(`${API_URL}/auth/machine-tokens/:name`, () =>
          HttpResponse.json(
            { error: { code: "MACHINE_TOKEN_NOT_FOUND", message: "no such token" } },
            { status: 404 },
          ),
        ),
      );

      await expect(client().revokeMachineToken("never-issued")).rejects.toMatchObject(
        { status: 404, code: "MACHINE_TOKEN_NOT_FOUND" },
      );
    });
  });

  /**
   * Machine tokens are not part of the inventory graph, so they are not in
   * `INVENTORY_ROOTS`: moving a box must not refetch a list of credentials,
   * and issuing one must not invalidate the forest.
   */
  it("keeps its cache key out of the inventory graph", () => {
    expect(queryKeys.machineTokens()).toEqual(["machine-tokens"]);
  });
});
