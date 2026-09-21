import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { SessionStore } from "./session-store.js";

const SessionContext = createContext<SessionStore | null>(null);

/**
 * The store is injected rather than a module singleton, unlike the web
 * client's.
 *
 * It has to be: the keystore behind it is a port (see `secure-storage.ts`),
 * and the composition root is the only place that knows which adapter this
 * run of the app is using.
 */
export const SessionProvider = ({
  store,
  children,
}: {
  readonly store: SessionStore;
  readonly children: ReactNode;
}): JSX.Element => (
  <SessionContext.Provider value={store}>{children}</SessionContext.Provider>
);

export const useSessionStore = (): SessionStore => {
  const store = useContext(SessionContext);
  if (store === null) {
    throw new Error("useSessionStore was called outside of a SessionProvider");
  }

  return store;
};
