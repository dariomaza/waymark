import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { MobileApiClient } from "./mobile-client.js";

const ApiContext = createContext<MobileApiClient | null>(null);

export const ApiProvider = ({
  client,
  children,
}: {
  readonly client: MobileApiClient;
  readonly children: ReactNode;
}): JSX.Element => <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;

/**
 * The client is injected rather than imported so the composition root decides
 * which API this app talks to — and so nothing below it can reach for a
 * different one.
 */
export const useApi = (): MobileApiClient => {
  const client = useContext(ApiContext);
  if (client === null) {
    throw new Error("useApi was called outside of an ApiProvider");
  }

  return client;
};
