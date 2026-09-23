import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ConfigurationResult } from "./configuration.js";
import { respond, type ToolContext } from "./tools/answering.js";
import { searchInventory } from "./tools/search.js";
import { createMcpApiClient } from "./waymark.js";

export const SERVER_NAME = "waymark";
export const SERVER_VERSION = "0.1.0";

/**
 * # The tools, and what they are for
 *
 * The product is "things get stored and then lost — not lost as in gone, lost
 * as in it is somewhere in one of forty boxes". Every tool here is a way of
 * asking where something is, and the descriptions say so in the words somebody
 * would use, because a description is the only thing a model reads before
 * deciding whether a tool is the right one.
 */
export const createWaymarkMcpServer = (configuration: ConfigurationResult): McpServer => {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "Waymark is a household inventory: storage units (rooms, shelves, " +
        "boxes) that hold items, and items that can be found again by " +
        "searching. Use waymark_search first for any question about where " +
        "something is — every result carries the full path to it. Reading is " +
        "free; the two tools that change the inventory ask for confirmation " +
        "before they do anything.",
    },
  );

  const context = contextOf(configuration);

  registerSearch(server, context);

  return server;
};

const contextOf = (configuration: ConfigurationResult): ToolContext =>
  configuration.ok
    ? {
        client: createMcpApiClient(configuration.configuration),
        baseUrl: configuration.configuration.baseUrl,
        problem: null,
        secret: configuration.configuration.token,
      }
    : {
        client: null,
        // There is no address to name when the configuration is what failed.
        baseUrl: "",
        problem: configuration.problem,
        secret: null,
      };

const registerSearch = (server: McpServer, context: ToolContext): void => {
  server.registerTool(
    "waymark_search",
    {
      title: "Search the Waymark inventory",
      description:
        "Find where something is. Searches items by name, tags and " +
        "description, and storage units by name, and answers with the full " +
        "path to each hit — 'Garage > Metal wardrobe > Box 3'. This is the " +
        "tool for any question of the form 'where is my ...' or 'which box " +
        "holds ...'. Accents do not matter in either direction, a term " +
        "matches the start of a word, and EVERY term must match, so fewer " +
        "words find more.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("What to look for, such as 'soldering iron' or 'cables'."),
        withinStorageUnitId: z
          .string()
          .optional()
          .describe(
            "Only look inside this storage unit, at any depth. A location is " +
              "itself a storage unit, so this is how 'search the garage' is " +
              "asked. The unit itself is not a result.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("How many hits of each kind to answer with at most."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      respond(context, "search the inventory", async (client) =>
        searchInventory(client, args),
      ),
  );
};
