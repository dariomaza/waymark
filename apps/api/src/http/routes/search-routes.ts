import { unitId, type SearchInventory } from "@waymark/domain";
import type { FastifyPluginAsync } from "fastify";

import type { ItemViews } from "../item-views.js";
import { searchQuerySchema } from "../validation.js";
import { itemSearchResultView, storageUnitSearchResultView } from "../views.js";

export interface SearchRouteOptions {
  readonly searchInventory: SearchInventory;
  readonly itemViews: ItemViews;
}

/**
 * # The route the product is named after
 *
 * Waymark exists because things get stored and then lost — not lost as in
 * gone, lost as in "it is somewhere in one of forty boxes". This is the thread
 * out of that labyrinth, so it is a resource of its own rather than a `?q=` on
 * the item collection: what it answers is not a filtered list of items, it is
 * items AND storage units, each with the path that says where it is.
 *
 * `GET`, because it reads. That makes a search a link somebody can bookmark,
 * share across a house, or open from the QR page — and the query lands in the
 * server log rather than in a body, which for a private inventory behind a
 * session is the right trade.
 *
 * Items and units come back as two lists instead of one merged one. They
 * answer two different questions — "where is my drill" and "where is Box 3" —
 * and interleaving them would need a made-up rule for whether a box called
 * `Cables` beats an item tagged `cables`. No such rule exists, so the API does
 * not invent one.
 */
export const searchRoutes: FastifyPluginAsync<SearchRouteOptions> = async (
  app,
  options,
) => {
  app.get("/search", async (request, reply) => {
    const { q, within, limit } = searchQuerySchema.parse(request.query);

    // A `within` that names nothing raises `StorageUnitNotFound`, which the
    // error mapping turns into a 422 rather than a 404: the id came from the
    // query string and not from the path, so a 404 would be a claim about
    // this route (ADR 8).
    const results = await options.searchInventory.execute({
      query: q,
      withinUnitId: within === undefined ? null : unitId(within),
      ...(limit === undefined ? {} : { limit }),
    });

    // One load of the photo rows for the whole answer, not one per hit.
    const items = await options.itemViews.withViews(results.items);

    return reply.code(200).send({
      query: q,
      // What the query was actually folded into, so a client can highlight the
      // words that matched instead of guessing at them.
      terms: [...results.terms],
      items: items.map(({ row, view }) => itemSearchResultView(row, view)),
      storageUnits: results.storageUnits.map(storageUnitSearchResultView),
    });
  });
};
