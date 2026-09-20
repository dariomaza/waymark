import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { WebApiClient } from "./web-client.js";

const ApiContext = createContext<WebApiClient | null>(null);

export const ApiProvider = ({
  client,
  children,
}: {
  readonly client: WebApiClient;
  readonly children: ReactNode;
}): JSX.Element => <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;

/**
 * The client is injected rather than imported so the composition root decides
 * which API this app talks to — and so nothing below it can reach for a
 * different one.
 */
export const useApi = (): WebApiClient => {
  const client = useContext(ApiContext);
  if (client === null) {
    throw new Error("useApi was called outside of an ApiProvider");
  }

  return client;
};
