import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ConfigurationResult } from "./configuration.js";
import { WriteConfirmations } from "./confirming.js";
import { writeAbilityOf } from "./credential.js";
import { addItemToUnit } from "./tools/add-item.js";
import { respond, type ToolContext } from "./tools/answering.js";
import { moveItemsToUnit } from "./tools/move-items.js";
import { listEverything } from "./tools/items.js";
import { searchInventory } from "./tools/search.js";
import { storageUnitTree } from "./tools/tree.js";
import { inspectStorageUnit } from "./tools/unit.js";
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
  registerUnit(server, context);
  registerTree(server, context);
  registerItems(server, context);
  registerAddItem(server, context);
  registerMoveItems(server, context);

  return server;
};

const contextOf = (configuration: ConfigurationResult): ToolContext => {
  if (!configuration.ok) {
    return {
        waymark: null,
        // There is no address to name when the configuration is what failed.
        baseUrl: "",
        problem: configuration.problem,
        secret: null,
    };
  }

  const client = createMcpApiClient(configuration.configuration);

  return {
    waymark: {
      client,
      confirmations: new WriteConfirmations(),
      writeAbility: writeAbilityOf(client),
    },
    baseUrl: configuration.configuration.baseUrl,
    problem: null,
    secret: configuration.configuration.token,
  };
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
      respond(context, "search the inventory", async ({ client }) =>
        searchInventory(client, args),
      ),
  );
};

const registerUnit = (server: McpServer, context: ToolContext): void => {
  server.registerTool(
    "waymark_unit",
    {
      title: "Look inside one storage unit",
      description:
        "Say what one storage unit holds: the storage units inside it and " +
        "the items in it, with its own full path and the description " +
        "somebody wrote for it. Use this after a search has named a unit, or " +
        "when someone asks what is in a particular box, shelf or room.",
      inputSchema: {
        storageUnitId: z
          .string()
          .describe("The id of the storage unit, as a search or the tree gave it."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      respond(context, `look inside storage unit ${args.storageUnitId}`, async ({ client }) =>
        inspectStorageUnit(client, args),
      ),
  );
};

const registerTree = (server: McpServer, context: ToolContext): void => {
  server.registerTool(
    "waymark_tree",
    {
      title: "The whole shape of the inventory",
      description:
        "Every storage unit in Waymark, nested, as an indented outline — the " +
        "rooms, what is in them, and what is in those. Use it to get your " +
        "bearings before answering a question about where things live, or to " +
        "find the id of the unit somebody means by name. It lists units, not " +
        "items: use waymark_search to find a thing.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      respond(context, "read the storage unit tree", async ({ client }) =>
        storageUnitTree(client),
      ),
  );
};

const registerItems = (server: McpServer, context: ToolContext): void => {
  server.registerTool(
    "waymark_items",
    {
      title: "Everything in the house",
      description:
        "Every item Waymark holds, in one flat list, each with the full path " +
        "to where it is. Use it for questions about the inventory as a whole " +
        "— 'how many X do I own', 'what is in the house' — rather than for " +
        "finding one thing, which is what waymark_search is for and which " +
        "stays cheap however large the inventory gets.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      respond(context, "list every item", async ({ client }) => listEverything(client)),
  );
};

/**
 * # The two tools that change something
 *
 * Both are registered as writes and both describe themselves as two calls,
 * because the description is the only thing a model reads before deciding how
 * to use one. `confirming.ts` holds the argument for why the second call
 * carries a code rather than a `true`.
 */
const CONFIRMATION_FIELD = z
  .string()
  .optional()
  .describe(
    "Leave this out on the first call. This tool then changes NOTHING and " +
      "describes what it would do, ending with a code. Show that description " +
      "to the person, and only if they agree, call again with the same " +
      "arguments and that code here. The code cannot be guessed, invented or " +
      "worked out from anything: it is only ever issued by this tool, it " +
      "belongs to that exact change, it works once, and it lapses. Do not put " +
      "a word such as 'yes' or 'true' here — it will be refused and nothing " +
      "will happen.",
  );

const registerAddItem = (server: McpServer, context: ToolContext): void => {
  server.registerTool(
    "waymark_add_item",
    {
      title: "Add an item to a storage unit (confirmed)",
      description:
        "Record something as being in a storage unit. This is a two-step " +
        "tool: called without a confirmation it changes nothing and answers " +
        "with what it WOULD do, in the unit's real name and full path, plus " +
        "a code. Calling it again with that code is what actually adds the " +
        "item.",
      inputSchema: {
        storageUnitId: z
          .string()
          .describe("The storage unit to put it in, by id, as a search or the tree gave it."),
        name: z.string().min(1).describe("What the thing is called."),
        description: z.string().optional().describe("Anything worth remembering about it."),
        quantity: z.number().int().min(1).optional().describe("How many. One if left out."),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "Labels that make it findable later, such as 'cables' or " +
              "'tools'. Searching a tag finds the item.",
          ),
        confirmation: CONFIRMATION_FIELD,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      respond(context, `add "${args.name}" to the inventory`, async (waymark) =>
        addItemToUnit(waymark, args),
      ),
  );
};

const registerMoveItems = (server: McpServer, context: ToolContext): void => {
  server.registerTool(
    "waymark_move_items",
    {
      title: "Move items into another storage unit (confirmed)",
      description:
        "Move one or more items into a different storage unit, all or " +
        "nothing. This is a two-step tool: called without a confirmation it " +
        "moves nothing and answers with every item by name, where each one " +
        "is now, where they would go, and a code. Calling it again with that " +
        "code is what actually moves them. Moving is the one thing that can " +
        "make the inventory wrong about where something is, so the " +
        "description is worth reading out.",
      inputSchema: {
        itemIds: z
          .array(z.string())
          .min(1)
          .describe("The items to move, by id, as a search gave them."),
        targetStorageUnitId: z.string().describe("The storage unit they should end up in."),
        confirmation: CONFIRMATION_FIELD,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      respond(
        context,
        `move ${args.itemIds.length} item(s) into storage unit ${args.targetStorageUnitId}`,
        async (waymark) => moveItemsToUnit(waymark, args),
      ),
  );
};
