import { queryKeys, type ChangeOwnPasswordInput, type UserCallerResponse } from "@waymark/api-client";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import { useSession } from "./use-session.js";

/**
 * # Changing your own password (ADR 26, amended)
 *
 * The API keeps this session and ends the others, and answers the person as
 * they now are. That answer replaces what `/auth/me` said, under the very key
 * the session gate reads, so a person who was flagged is let through at once;
 * every other query is asked again, since anything asked while the password
 * was temporary was refused.
 *
 * `currentPassword` is passed through as given: the caller leaves it out when
 * the person is flagged, and sends it otherwise.
 */
export const useChangeOwnPassword = (): UseMutationResult<
  UserCallerResponse,
  Error,
  ChangeOwnPasswordInput
> => {
  const api = useApi();
  const queries = useQueryClient();
  const token = useSession()?.token ?? "";

  return useMutation({
    mutationFn: async (input: ChangeOwnPasswordInput) => await api.changeOwnPassword(input),
    onSuccess: (answer) => {
      queries.setQueryData(queryKeys.session(token), answer);
      void queries.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.session(token)[0],
      });
    },
  });
};
