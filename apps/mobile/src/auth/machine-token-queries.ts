import {
  queryKeys,
  type IssuedMachineTokenResponse,
  type MachineTokenListResponse,
} from "@waymark/api-client";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";

/**
 * # Credentials for programs, as this app reads and changes them
 *
 * Machine tokens are not part of the inventory graph, so none of this touches
 * `useInvalidateInventory` and nothing in that file touches these. Moving a
 * box must not refetch a list of credentials, and issuing a credential must
 * not invalidate the forest.
 *
 * `staleTime: 0` on every read of the list. This app's default is 30 seconds,
 * which is right for a shelf of boxes and wrong for the screen somebody opens
 * BECAUSE they think a credential has leaked.
 */
export const useMachineTokens = (): UseQueryResult<MachineTokenListResponse, Error> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.machineTokens(),
    queryFn: async () => await api.machineTokens(),
    staleTime: 0,
  });
};

export interface CreateMachineTokenVariables {
  readonly name: string;
  readonly scope: string;
}

/**
 * The two mutations that answer with a live secret.
 *
 * Neither writes the answer into the query cache, and that is deliberate
 * rather than an omission: the cache is a store with a lifetime nobody is
 * thinking about while they read a warning that says "copy this now". The
 * secret goes into component state, is rendered, and goes when the component
 * does. The LIST is invalidated instead, which is the part that is safe to
 * keep.
 */
export const useCreateMachineToken = (): UseMutationResult<
  IssuedMachineTokenResponse,
  Error,
  CreateMachineTokenVariables
> => {
  const api = useApi();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async (variables: CreateMachineTokenVariables) =>
      await api.createMachineToken({
        name: variables.name,
        scope: variables.scope as never,
      }),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.machineTokens() });
    },
  });
};

export const useRotateMachineToken = (): UseMutationResult<
  IssuedMachineTokenResponse,
  Error,
  string
> => {
  const api = useApi();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => await api.rotateMachineToken(name),
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.machineTokens() });
    },
  });
};

export const useRevokeMachineToken = (): UseMutationResult<void, Error, string> => {
  const api = useApi();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      await api.revokeMachineToken(name);
    },
    /**
     * `onSettled`, not `onSuccess`. A revocation that came back 404 means the
     * token is not there — which is exactly the case where the list on screen
     * is the thing that is wrong, so it gets refetched either way.
     */
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.machineTokens() });
    },
  });
};
