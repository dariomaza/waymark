import type { ItemId } from "@ariadna/domain";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import type { ItemDetailResponse, ItemView } from "../api/contract.js";
import { queryKeys } from "../api/query-keys.js";
import { flattenUnits } from "../units/flatten-tree.js";
import { useStorageUnitTree } from "../units/unit-queries.js";

/**
 * One item, with the path that says where it is.
 *
 * "Where is it" is the question this product exists to answer, so the API
 * ships the breadcrumb with the item rather than making a client ask twice.
 */
export const useItem = (id: ItemId): UseQueryResult<ItemDetailResponse, Error> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.item(id),
    queryFn: async () => await api.item(id),
  });
};

export interface ItemAtALocation {
  readonly item: ItemView;
  /** `Garage > Box 3`, the unit that holds it. */
  readonly location: string;
}

export interface EveryItem {
  readonly rows: readonly ItemAtALocation[];
  readonly isPending: boolean;
  readonly error: Error | null;
  refetch(): void;
}

/**
 * # Every item in the house
 *
 * Assembled from one request per storage unit, and that is a real cost worth
 * naming: the API has `GET /storage-units` for the whole forest and
 * `GET /storage-units/:id` for what one holds, but no collection route for
 * items. There is nothing to ask for "every item", so this asks every unit.
 *
 * At homelab scale that is tens of small requests, they run in parallel, and
 * every answer is the SAME cache entry the unit screen uses — so walking into
 * a box after this screen costs nothing. It is still N+1 over HTTP, and the
 * honest fix is a `GET /items` on the API rather than anything cleverer here.
 */
export const useEveryItem = (): EveryItem => {
  const api = useApi();
  const tree = useStorageUnitTree();
  const units = flattenUnits(tree.data?.tree ?? []);

  const answers = useQueries({
    queries: units.map((entry) => ({
      queryKey: queryKeys.unit(entry.unit.id),
      queryFn: async () => await api.unit(entry.unit.id),
    })),
  });

  const rows = answers
    .flatMap((answer, index) => {
      const entry = units[index];
      if (entry === undefined || answer.data === undefined) {
        return [];
      }

      return answer.data.items.map((item) => ({ item, location: entry.location }));
    })
    // A total order, so two reads of an unchanged inventory list the same way.
    .sort((left, right) => left.item.name.localeCompare(right.item.name, "en"));

  return {
    rows,
    isPending: tree.isPending || answers.some((answer) => answer.isPending),
    error: tree.error ?? answers.find((answer) => answer.error !== null)?.error ?? null,
    refetch: () => {
      void tree.refetch();
      for (const answer of answers) {
        void answer.refetch();
      }
    },
  };
};
