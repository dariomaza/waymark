import {
  queryKeys,
  type PasskeyListResponse,
  type PasskeyView,
} from "@waymark/api-client";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import { usePasskeyPlatform } from "./passkey-context.js";
import type { Session } from "./session-store.js";

/**
 * # The devices on your own account, as this app reads and changes them
 *
 * Account state, not inventory: none of this touches `INVENTORY_ROOTS` and
 * nothing in `use-invalidate-inventory.ts` touches it. Moving a box must not
 * refetch a list of credentials, and adding a device must not invalidate the
 * forest — the same separation the machine tokens already have.
 *
 * `staleTime: 0` for the same reason as theirs: the app's default of thirty
 * seconds is right for a shelf of boxes and wrong for the screen somebody
 * opens BECAUSE they think a device has been stolen.
 */
export const usePasskeys = (): UseQueryResult<PasskeyListResponse> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.passkeys(),
    queryFn: async () => await api.passkeys(),
    staleTime: 0,
  });
};

/**
 * Whether this device can serve a passkey at all.
 *
 * Asked once and cached for the session, because the answer is about hardware
 * and a browser build: it does not change while somebody is looking at the
 * screen. A `false` here is what keeps the sign-in button from appearing at
 * all, which is ADR 19's rule that nothing is offered that will fail.
 */
export const usePasskeySupport = (): UseQueryResult<boolean> => {
  const platform = usePasskeyPlatform();

  return useQuery({
    queryKey: ["passkey-support"],
    queryFn: async () => await platform.isAvailable(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
};

/**
 * The whole sign-in ceremony, as one mutation.
 *
 * Three steps that are one act from the person's side: ask for a challenge,
 * put the prompt on the screen, send back what the authenticator signed. It
 * is one mutation rather than three so that `isPending` covers the whole of
 * it, including the seconds the prompt is open — which is the part somebody
 * is actually waiting through.
 */
export const usePasskeySignIn = (): UseMutationResult<Session, Error, void> => {
  const api = useApi();
  const platform = usePasskeyPlatform();

  return useMutation({
    mutationFn: async (): Promise<Session> => {
      const started = await api.beginPasskeyLogin();
      const credential = await platform.assert(started.options);

      return await api.finishPasskeyLogin({
        ceremonyId: started.ceremonyId,
        credential,
      });
    },
  });
};

export const useAddPasskey = (): UseMutationResult<PasskeyView, Error, string> => {
  const api = useApi();
  const platform = usePasskeyPlatform();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async (label: string): Promise<PasskeyView> => {
      const started = await api.beginPasskeyRegistration();
      const credential = await platform.register(started.options);

      const { passkey } = await api.finishPasskeyRegistration({
        ceremonyId: started.ceremonyId,
        label,
        credential,
      });

      return passkey;
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.passkeys() });
    },
  });
};

export const useRemovePasskey = (): UseMutationResult<void, Error, string> => {
  const api = useApi();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.removePasskey(id);
    },
    /**
     * `onSettled`, not `onSuccess`. A removal that came back 404 means the
     * device is not there — which is exactly the case where the list on screen
     * is the thing that is wrong, so it gets refetched either way.
     */
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: queryKeys.passkeys() });
    },
  });
};
