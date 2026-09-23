import { counted, detailLine, idOf, itemFacts, paragraphs } from "../render.js";
import type { McpApiClient } from "../waymark.js";

/**
 * # Everything, each with where it is
 *
 * One unpaginated request, because that is what the API promises (ADR 15) and
 * for the reason it gives: a flat list of names answers nothing in a product
 * about knowing where things are, so every row carries the same breadcrumb a
 * search hit does.
 *
 * One line per item, and the location is on it rather than under it. This is
 * the longest answer this server can give — it is the whole inventory — so it
 * is the one where the cost of a second line per row is paid three hundred
 * times. Everything that is only ever the default is left off for the same
 * reason.
 *
 * The honest answer to an inventory too large to list is search, not a page,
 * which is what `waymark_search` is for and what the tool description says.
 */
export const listEverything = async (client: McpApiClient): Promise<string> => {
  const { items } = await client.items();

  if (items.length === 0) {
    return "Waymark holds no items yet.";
  }

  return paragraphs(
    `Waymark holds ${counted(items.length, "item")}:`,
    items
      .map((row) =>
        [
          `${row.item.name} — ${row.location}`,
          detailLine([...itemFacts(row.item), idOf(row.item.id)]),
        ].join(" · "),
      )
      .join("\n"),
  );
};
