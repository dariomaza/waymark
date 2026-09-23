import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { anItem, anItemHit, aStorageUnit, withPhoto } from "@waymark/api-client/testing";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  aConfiguredServer,
  aMachineToken,
  API_URL,
  A_TOKEN,
  stubbedApi,
} from "./testing/api.js";
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

/**
 * The two-call dance, driven the way a model would drive it.
 *
 * This is the test that matters most in this file: it proves that a tool
 * marked as a write does not write when it is first called, that the only
 * thing that makes it write is a value this server issued, and that a
 * read-only credential is answered in words rather than with a 403.
 */
describe("a write, over the protocol", () => {
  const BOX = aStorageUnit({ id: "box-3", parentId: "garage", name: "Box 3" });
  const GARAGE = aStorageUnit({ id: "garage", name: "Garage" });

  const inventoryAnswering = (scope: "read" | "read-write", added: unknown[]): void => {
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () => HttpResponse.json(aMachineToken(scope))),
      http.get(`${API_URL}/storage-units/box-3`, () =>
        HttpResponse.json({
          unit: withPhoto(BOX),
          path: [GARAGE, BOX],
          children: [],
          items: [],
        }),
      ),
      http.post(`${API_URL}/items`, async ({ request }) => {
        added.push(await request.json());

        return HttpResponse.json({ item: anItem({ id: "iron" }) }, { status: 201 });
      }),
    );
  };

  it("previews, then adds only when the code it issued comes back", async () => {
    const added: unknown[] = [];
    inventoryAnswering("read-write", added);
    const client = await connected(aConfiguredServer());
    const adding = { storageUnitId: "box-3", name: "Soldering iron" };

    const preview = await client.callTool({ name: "waymark_add_item", arguments: adding });
    expect(added).toEqual([]);
    expect(textOf(preview)).toContain("Garage > Box 3");

    const code = /confirmation: "([^"]+)"/u.exec(textOf(preview))?.[1] ?? "";
    const done = await client.callTool({
      name: "waymark_add_item",
      arguments: { ...adding, confirmation: code },
    });

    expect(done.isError).toBeFalsy();
    expect(added).toHaveLength(1);
  });

  it("refuses the word a guess would reach for, and adds nothing", async () => {
    const added: unknown[] = [];
    inventoryAnswering("read-write", added);
    const client = await connected(aConfiguredServer());

    const result = await client.callTool({
      name: "waymark_add_item",
      arguments: { storageUnitId: "box-3", name: "Soldering iron", confirmation: "yes" },
    });

    expect(result.isError).toBe(true);
    expect(added).toEqual([]);
  });

  it("tells a read-only token it cannot write, instead of surfacing a 403", async () => {
    const added: unknown[] = [];
    inventoryAnswering("read", added);
    const client = await connected(aConfiguredServer());

    const result = await client.callTool({
      name: "waymark_add_item",
      arguments: { storageUnitId: "box-3", name: "Soldering iron" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("read-only");
    expect(textOf(result)).not.toContain("403");
    expect(added).toEqual([]);
  });
});
