import { queryKeys, type ItemDetailResponse, type ItemListResponse } from "@waymark/api-client";
import type { ItemId } from "@waymark/domain";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";

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
 * Every item in the house, in one request, each row with its own breadcrumb
 * (ADR 15). Unpaginated on purpose — the honest answer to an inventory too
 * large to list is search, which this product is named after.
 */
export const useEveryItem = (): UseQueryResult<ItemListResponse, Error> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.items(),
    queryFn: async () => await api.items(),
  });
};
