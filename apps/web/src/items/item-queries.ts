import type { ItemId } from "@ariadna/domain";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import type { ItemDetailResponse } from "../api/contract.js";
import { queryKeys } from "../api/query-keys.js";

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
