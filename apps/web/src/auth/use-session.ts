import type { Credentials } from "@ariadna/api-client";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { useApi } from "../api/api-context.js";
import { clearCachedResponses } from "../app/cached-responses.js";
import { sessionStore, type Session } from "./session-store.js";

/** Re-renders whatever reads it the moment the session appears or goes. */
export const useSession = (): Session | null =>
  useSyncExternalStore(sessionStore.subscribe, sessionStore.read, sessionStore.read);

export const useSignIn = (): UseMutationResult<Session, Error, Credentials> => {
  const api = useApi();

  return useMutation({
    mutationFn: async (credentials: Credentials) => await api.login(credentials),
    onSuccess: (session) => {
      sessionStore.save(session);
    },
  });
};

export const useSignOut = (): UseMutationResult<void, Error, void> => {
  const api = useApi();
  const queries = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.logout();
    },
    /**
     * `onSettled`, not `onSuccess`. Revoking the row is the server's job and
     * it is immediate, but a logout tapped in a dead spot must still end the
     * session on this device — otherwise the one action a worried person
     * takes is the one that does nothing.
     *
     * The query cache goes with it: it holds the inside of a house.
     */
    onSettled: () => {
      sessionStore.clear();
      queries.clear();
      // The service worker is holding photographs of the inside of a house.
      void clearCachedResponses();
    },
  });
};
