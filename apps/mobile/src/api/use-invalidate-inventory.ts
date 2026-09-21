import { INVENTORY_ROOTS } from "@ariadna/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * The inventory is one graph.
 *
 * Moving an item changes the unit it left, the unit it arrived in, the item
 * itself and any search that mentioned it, and no client-side patch of the
 * cache can be trusted to have got all four right — the API is the source of
 * truth about what the inventory now looks like. So every write throws away
 * what was cached and asks again. The roots are the shared package's, so the
 * two clients cannot disagree about what a move makes stale.
 */
export const useInvalidateInventory = (): (() => void) => {
  const queries = useQueryClient();

  return useCallback(() => {
    for (const queryKey of INVENTORY_ROOTS) {
      void queries.invalidateQueries({ queryKey });
    }
  }, [queries]);
};
