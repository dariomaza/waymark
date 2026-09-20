import type { ItemId } from "@ariadna/domain";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import { type ItemDetailResponse, type ItemListResponse, queryKeys } from "@ariadna/api-client";

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

/**
 * # Every item in the house
 *
 * One request, and every row arrives with its own breadcrumb.
 *
 * This screen used to be ASSEMBLED: `GET /storage-units` for the forest, then
 * one `GET /storage-units/:id` per unit, then the items flattened and sorted
 * here. That was N+1 over HTTP from a phone, and the ordering was this
 * client's opinion rather than the API's answer. `GET /items` replaced all of
 * it, which is what the comment that used to live here asked for.
 */
export const useEveryItem = (): UseQueryResult<ItemListResponse, Error> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.items(),
    queryFn: async () => await api.items(),
  });
};
