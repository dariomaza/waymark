import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { anItem, anItemHit, aStorageUnit } from "@waymark/api-client/testing";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { aConfiguredServer, API_URL, A_TOKEN, stubbedApi } from "./testing/api.js";
import { MACHINE_TOKEN_VARIABLE } from "./configuration.js";
import { createWaymarkMcpServer } from "./server.js";
import { readConfiguration } from "./configuration.js";

const apiServer = stubbedApi();

/**
 * Driven through the real protocol, over the SDK's in-memory transport pair.
 *
 * A test that called the tool functions directly would prove they work and say
 * nothing about whether they are registered, whether their schemas accept what
 * a model would send, or whether a refusal reaches a caller as a readable
 * answer instead of a failed call. This is the same reasoning `apps/web` uses
 * for driving its screens through the DOM.
 */
const connected = async (
  server: ReturnType<typeof createWaymarkMcpServer>,
): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "a-test", version: "0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return client;
};

/**
 * `callTool` answers a union, because the protocol still carries a shape from
 * before tools had structured content. Only one of them is what this server
 * sends, and reading it back is a test concern rather than a typed contract.
 */
const textOf = (result: unknown): string =>
  (((result as { content?: unknown }).content ?? []) as { text?: string }[])
    .map((part) => part.text ?? "")
    .join("\n");

describe("the MCP server", () => {
  it("offers the tools an assistant needs to find something", async () => {
    const client = await connected(aConfiguredServer());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain("waymark_search");
  });

  it("answers a search over the wire with where the thing is", async () => {
    apiServer.use(
      http.get(`${API_URL}/search`, () =>
        HttpResponse.json({
          query: "soldering",
          terms: ["soldering"],
          items: [
            anItemHit(anItem({ id: "iron", name: "Soldering iron" }), [
              aStorageUnit({ id: "garage", name: "Garage" }),
              aStorageUnit({ id: "box-3", name: "Box 3" }),
            ]),
          ],
          storageUnits: [],
        }),
      ),
    );
    const client = await connected(aConfiguredServer());

    const result = await client.callTool({
      name: "waymark_search",
      arguments: { query: "soldering" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain("Garage > Box 3");
  });

  /**
   * The server still starts, and still lists its tools. An assistant that was
   * told "no tools" would say Waymark is unavailable and stop; one that is
   * told what is missing can say how to fix it.
   */
  it("starts without a token and every tool says how to make one", async () => {
    const client = await connected(createWaymarkMcpServer(readConfiguration({})));

    const { tools } = await client.listTools();
    const result = await client.callTool({
      name: "waymark_search",
      arguments: { query: "soldering" },
    });

    expect(tools.map((tool) => tool.name)).toContain("waymark_search");
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(MACHINE_TOKEN_VARIABLE);
    expect(textOf(result)).toContain("machine-token create");
  });

  it("says the API could not be reached, rather than throwing at the caller", async () => {
    apiServer.use(http.get(`${API_URL}/search`, () => HttpResponse.error()));
    const client = await connected(aConfiguredServer());

    const result = await client.callTool({
      name: "waymark_search",
      arguments: { query: "soldering" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(API_URL);
    expect(textOf(result)).not.toContain("fetch failed");
  });

  it("says the token was refused, and never repeats it", async () => {
    apiServer.use(
      http.get(`${API_URL}/search`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_MACHINE_TOKEN",
              message: "The machine token is missing, invalid, revoked or expired",
            },
          },
          { status: 401 },
        ),
      ),
    );
    const client = await connected(aConfiguredServer());

    const result = await client.callTool({
      name: "waymark_search",
      arguments: { query: "soldering" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/refused/iu);
    expect(textOf(result)).not.toContain(A_TOKEN);
  });
});
