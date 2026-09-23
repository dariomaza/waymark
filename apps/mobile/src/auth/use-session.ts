import type { Credentials } from "@waymark/api-client";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { useTranslate } from "../app/language-context.js";
import { useApi } from "../api/api-context.js";
import { useSessionStore } from "./session-context.js";
import type { Session, SessionState } from "./session-store.js";

/** Re-renders whatever reads it the moment the session appears or goes. */
export const useSessionState = (): SessionState => {
  const store = useSessionStore();

  return useSyncExternalStore(store.subscribe, store.read, store.read);
};

export const useSignIn = (): UseMutationResult<Session, Error, Credentials> => {
  const api = useApi();
  const store = useSessionStore();
  const t = useTranslate();

  return useMutation({
    mutationFn: async (credentials: Credentials) => await api.login(credentials),
    onSuccess: (session) => {
      // The prompt is copy, so it comes from here rather than from the store:
      // on Android, sealing the token is itself an operation the keystore asks
      // somebody to authorise, and the sentence it shows has to be in the
      // language the person just signed in through.
      store.save(session, t("login.sealPrompt"));
    },
  });
};

/**
 * The second door on the login screen.
 *
 * It is a mutation and not a query because it is a thing somebody DOES, once,
 * on purpose: it puts the system's prompt on screen. A query would retry it,
 * refetch it and repeat it on focus, and every one of those is a fingerprint
 * prompt nobody asked for.
 *
 * A dismissed prompt arrives here as a rejection, and the screen's answer to
 * that is to do nothing at all — the password form is already in front of
 * them, and re-asking is what turns this feature into a trap.
 */
export const useUnlockSealedSession = (): UseMutationResult<Session | null, Error, void> => {
  const store = useSessionStore();
  const t = useTranslate();

  return useMutation({
    mutationFn: async () => await store.unlockSealed(t("login.unlockPrompt")),
  });
};

export const useSignOut = (): UseMutationResult<void, Error, void> => {
  const api = useApi();
  const store = useSessionStore();
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
      store.clear();
      queries.clear();
    },
  });
};
