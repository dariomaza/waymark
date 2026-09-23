import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

import { readConfiguration } from "../configuration.js";
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
