import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

import { readConfiguration } from "../configuration.js";
import { WriteConfirmations } from "../confirming.js";
import { writeAbilityOf } from "../credential.js";
import type { Waymark } from "../tools/answering.js";
import { createWaymarkMcpServer } from "../server.js";
import { createMcpApiClient, type McpApiClient } from "../waymark.js";

/**
 * The API is stubbed at the HTTP boundary and nowhere else.
 *
 * `@waymark/api-client` is never mocked in this package, for the reason
 * `apps/web` gives for never mocking it either: a test that replaced the
 * client would prove the replacement was called and would say nothing about
 * the contract with the API. These tests run the real client, the real header,
 * the real error envelope reading and the real URL building against MSW
 * answering the way `apps/api` does.
 */
export const API_URL = "http://127.0.0.1:3000";

/** Shaped like a real one so nothing is refused for the wrong reason. */
export const A_TOKEN = "wmk_UtA2N3EFkpL-x7QcVb0ZsYdH1jRmW9nT4oIgS6uCfBe";

export const stubbedApi = (): ReturnType<typeof setupServer> => {
  const server = setupServer();

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });

  return server;
};

export const aClient = (): McpApiClient =>
  createMcpApiClient({ baseUrl: API_URL, token: A_TOKEN });

/** The whole server, configured the way a working installation would be. */
export const aConfiguredServer = (
  environment: Readonly<Record<string, string | undefined>> = {
    WAYMARK_API_URL: API_URL,
    WAYMARK_MACHINE_TOKEN: A_TOKEN,
  },
): ReturnType<typeof createWaymarkMcpServer> =>
  createWaymarkMcpServer(readConfiguration(environment));

/**
 * A machine token as `GET /auth/me` describes one. Its scope is the whole
 * point: a `read` token must make the write tools refuse in words, before
 * anything is previewed and long before the API has to say 403.
 */
export const aMachineToken = (
  scope: "read" | "read-write",
  name = "mcp-server",
): Record<string, unknown> => ({
  machineToken: {
    id: "mt1",
    name,
    scope,
    createdAt: "2026-09-23T09:00:00.000Z",
    expiresAt: null,
    lastUsedAt: null,
  },
});

/** The whole of what a tool is handed, wired to the stubbed API. */
export const aWaymark = (): Waymark => {
  const client = aClient();

  return {
    client,
    confirmations: new WriteConfirmations(),
    writeAbility: writeAbilityOf(client),
  };
};
