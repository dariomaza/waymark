import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { INVENTORY_ROOTS } from "./query-keys.js";

/**
 * The inventory is one graph.
 *
 * Moving an item changes the unit it left, the unit it arrived in, the item
 * itself and any search that mentioned it, and no client-side patch of the
 * cache can be trusted to have got all four right — the API is the source of
 * truth about what the inventory now looks like. So every write throws away
 * what was cached and asks again.
 *
 * At this size that is one small request per screen in view, which is a
 * rounding error next to being wrong about where something is.
 */
export const useInvalidateInventory = (): (() => void) => {
  const queries = useQueryClient();

  return useCallback(() => {
    for (const queryKey of INVENTORY_ROOTS) {
      void queries.invalidateQueries({ queryKey });
    }
  }, [queries]);
};
