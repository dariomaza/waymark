import type { StorageUnitTreeView } from "@waymark/api-client";

import { counted, idOf, paragraphs, unitName } from "../render.js";
import type { McpApiClient } from "../waymark.js";

/**
 * # Orienting yourself
 *
 * A storage unit is a recursive tree and a location IS a storage unit (ADR 1),
 * so "the house" and "the garage" and "Box 3" are the same kind of thing at
 * three depths. The whole forest is one request, unpaginated, because a
 * homelab inventory is small enough to read whole.
 *
 * It is drawn as an indented outline rather than as nested objects because
 * depth is the only thing this answer is about, and indentation is how a
 * reader sees depth without counting brackets. Two spaces a level: deep enough
 * to be unmistakable, cheap enough that a four-level forest has not spent a
 * quarter of its characters on whitespace.
 *
 * There are no item counts here. The API does not put them on a tree node and
 * this server does not go and fetch forty units to find out — a tool that made
 * a request per box would be slower than the question deserves and would be
 * answering a different question anyway. `waymark_unit` is where what is
 * inside one is asked.
 */
export const storageUnitTree = async (client: McpApiClient): Promise<string> => {
  const { tree } = await client.tree();

  if (tree.length === 0) {
    return (
      "Waymark has no storage units yet, so it holds nothing. A unit is a " +
      "room, a shelf, a box or a drawer, and it is created in the Waymark app."
    );
  }

  const lines = tree.flatMap((root) => outline(root, 0));

  return paragraphs(
    `Waymark holds ${counted(lines.length, "storage unit")}, nested like this:`,
    lines.join("\n"),
  );
};

const outline = (node: StorageUnitTreeView, depth: number): readonly string[] => [
  `${"  ".repeat(depth)}${unitName(node)} — ${idOf(node.id)}`,
  ...node.children.flatMap((child) => outline(child, depth + 1)),
];
