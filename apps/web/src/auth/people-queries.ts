import {
  isMachineCaller,
  queryKeys,
  type AccountListResponse,
  type AccountResponse,
  type IssuedAccountResponse,
  type CreateAccountInput,
  type UserView,
} from "@waymark/api-client";
import { Role } from "@waymark/domain";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import { useSession } from "./use-session.js";

/**
 * # The People group, as this app reads and changes it (ADR 26)
 *
 * Accounts are not part of the inventory graph, so nothing here touches
 * `INVENTORY_ROOTS`, and `staleTime: 0` for the reason the machine tokens
 * give: this is the screen somebody opens to change who can get in.
 */

/**
 * The person signed in, as `GET /auth/me` says NOW — the very question the
 * session gate already asked, under the same key, so this costs no second
 * request. Read from there rather than from the session kept since sign-in,
 * which predates the role and goes stale when an administrator is demoted.
 *
 * `null` while that is not known, and for a machine token, which is nobody.
 * It decides only what is DRAWN: every route checks the caller itself.
 */
export const useCaller = (): UserView | null => {
  const api = useApi();
  const session = useSession();

  const me = useQuery({
    queryKey: queryKeys.session(session?.token ?? ""),
    queryFn: async () => await api.me(),
    enabled: session !== null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return me.data === undefined || isMachineCaller(me.data) ? null : me.data.user;
};

/** Whether the person signed in is an administrator (ADR 26). */
export const useIsAdministrator = (): boolean => useCaller()?.role === Role.ADMINISTRATOR;

export const useAccounts = (enabled: boolean): UseQueryResult<AccountListResponse> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: async () => await api.accounts(),
    enabled,
    staleTime: 0,
  });
};

/** Every change answers the account as it stands; the list is fetched again. */
const useAccountChange = <TVariables, TAnswer extends AccountResponse = AccountResponse>(
  call: (variables: TVariables) => Promise<TAnswer>,
): UseMutationResult<TAnswer, Error, TVariables> => {
  const queries = useQueryClient();

  return useMutation({
    mutationFn: call,
    // Settled, not succeeded: a refusal such as "not here any more" is
    // exactly when the list on screen is the thing that is wrong.
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.accounts() });
    },
  });
};

export const useCreateAccount = (): UseMutationResult<
  IssuedAccountResponse,
  Error,
  CreateAccountInput
> => {
  const api = useApi();

  return useAccountChange(async (input: CreateAccountInput) => await api.createAccount(input));
};

export const useChangeAccountRole = (): UseMutationResult<
  AccountResponse,
  Error,
  { readonly id: string; readonly role: Role }
> => {
  const api = useApi();

  return useAccountChange(
    async ({ id, role }: { readonly id: string; readonly role: Role }) =>
      await api.changeAccountRole(id, role),
  );
};

export const useResetAccountPassword = (): UseMutationResult<
  IssuedAccountResponse,
  Error,
  { readonly id: string; readonly password: string }
> => {
  const api = useApi();

  return useAccountChange(
    // The API generates the password now (ADR 26, amended); the typed one is
    // not sent. The screen that shows the generated one comes with the client
    // work that follows.
    async ({ id }: { readonly id: string; readonly password: string }) =>
      await api.resetAccountPassword(id),
  );
};

export const useDisableAccount = (): UseMutationResult<AccountResponse, Error, string> => {
  const api = useApi();

  return useAccountChange(async (id: string) => await api.disableAccount(id));
};

export const useEnableAccount = (): UseMutationResult<AccountResponse, Error, string> => {
  const api = useApi();

  return useAccountChange(async (id: string) => await api.enableAccount(id));
};
