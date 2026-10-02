import { queryKeys, type ShareListResponse } from "@waymark/api-client";
import { type ShareLevel, type UnitId } from "@waymark/domain";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";

/** A share's level, or none at all: the three answers the Share sheet gives. */
export type ShareChoice = ShareLevel | "none";

/** Who this space itself is shared with (ADR 26). An administrator's call. */
export const useShares = (id: UnitId): UseQueryResult<ShareListResponse> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.shares(id),
    queryFn: async () => await api.shares(id),
    staleTime: 0,
  });
};

/**
 * Saves one person's answer the moment it is chosen: a level is a share, and
 * "none" takes the share away. Settled, not succeeded, fetches the list again,
 * because after a refusal the list on screen is what is wrong.
 */
export const useChangeShare = (
  id: UnitId,
): UseMutationResult<unknown, Error, { readonly accountId: string; readonly choice: ShareChoice }> => {
  const api = useApi();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async ({ accountId, choice }: { readonly accountId: string; readonly choice: ShareChoice }) =>
      choice === "none"
        ? await api.stopSharing(id, accountId)
        : await api.shareSpace(id, accountId, choice),
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.shares(id) });
    },
  });
};
