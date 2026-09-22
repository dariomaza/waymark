import { queryKeys, type PhotoProcessingResponse } from "@waymark/api-client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";

/**
 * What background removal is doing, read fresh.
 *
 * It is the one query in this app with no `staleTime`: everything else
 * describes an inventory that only changes when somebody changes it, and this
 * describes a queue that moves on its own. A cached answer here is the exact
 * thing the screen exists to avoid — a person watching a number that stopped
 * being true while they were looking at it.
 */
export const usePhotoProcessing = (): UseQueryResult<PhotoProcessingResponse, Error> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.photoProcessing(),
    queryFn: async () => await api.photoProcessing(),
    staleTime: 0,
  });
};
