import type { UnitId } from "@ariadna/domain";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import { queryKeys, type SearchResponse } from "@ariadna/api-client";

/**
 * An empty query is not a request to dump the inventory — the API says so and
 * answers nothing — so it is not even sent. A search page nobody has typed
 * into yet should cost zero requests.
 */
export const useSearch = (
  query: string,
  within: UnitId | null,
): UseQueryResult<SearchResponse, Error> => {
  const api = useApi();
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.search(trimmed, within, undefined),
    queryFn: async () =>
      await api.search({
        query: trimmed,
        ...(within === null ? {} : { within }),
      }),
    enabled: trimmed !== "",
    // The previous answer stays on screen while the next one is fetched.
    // Blanking the list on every keystroke makes a fast search feel broken.
    placeholderData: keepPreviousData,
  });
};
