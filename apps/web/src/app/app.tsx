import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { Route, Routes } from "react-router-dom";

import { ApiProvider } from "../api/api-context.js";
import { FailureKind, failureKindOf } from "../api/api-error.js";
import type { AriadnaClient } from "../api/ariadna-client.js";
import { LoginScreen } from "../auth/login-screen.js";
import { RequireSession } from "../auth/require-session.js";
import { AllItemsScreen } from "../items/all-items-screen.js";
import { ItemScreen } from "../items/item-screen.js";
import { ScannedLabelScreen } from "../scanning/scanned-label-screen.js";
import { SearchScreen } from "../search/search-screen.js";
import { InventoryScreen } from "../units/inventory-screen.js";
import { LabelScreen } from "../units/label-screen.js";
import { UnitScreen } from "../units/unit-screen.js";
import { AppShell } from "./app-shell.js";
import { createDefaultClient } from "./create-client.js";
import { NotFoundScreen } from "./not-found-screen.js";

export interface AppProps {
  /**
   * The composition root builds one by default. Tests do not replace it —
   * they answer the network with MSW instead — but a client pointed at a
   * different API is the one thing worth being able to inject.
   */
  readonly client?: AriadnaClient;
}

/**
 * The composition root.
 *
 * Everything the app can DO lives in a folder named after it — `auth`,
 * `units`, `items`, `search`, `scanning`, `photos`. This file is the only one
 * that knows they all exist: it wires the providers and the route table
 * around them. No feature folder imports another feature's screens, so what
 * the app does stays readable from the directory listing.
 *
 * The router is deliberately outside: `main.tsx` mounts a `BrowserRouter`,
 * the tests mount a `MemoryRouter` at the URL under test, and everything in
 * between is the same app.
 */
export const App = ({ client }: AppProps = {}): JSX.Element => {
  const [queries] = useState(createQueryClient);
  const [api] = useState(() => client ?? createDefaultClient());

  return (
    <QueryClientProvider client={queries}>
      <ApiProvider client={api}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />

          <Route element={<RequireSession />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<InventoryScreen />} />
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/units/:id" element={<UnitScreen />} />
              <Route path="/units/:id/label" element={<LabelScreen />} />
              <Route path="/items" element={<AllItemsScreen />} />
              <Route path="/items/:id" element={<ItemScreen />} />
              {/* The address printed on every box. See the screen. */}
              <Route path="/u/:publicId" element={<ScannedLabelScreen />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundScreen />} />
        </Routes>
      </ApiProvider>
    </QueryClientProvider>
  );
};

/**
 * # Retrying, and why there is so little of it
 *
 * A refusal is not a flake. A 409 means the box is not empty and a 422 means
 * the request is wrong; asking again changes neither, it just delays the
 * sentence that would have told somebody what to do. Only a request that
 * never left the phone is worth repeating, and only once — after that the
 * screen says so and offers a button, which in a garage with one bar of
 * signal is more honest than a spinner that hides ten seconds of failure.
 */
const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          failureKindOf(error) === FailureKind.OFFLINE && failureCount < 1,
        retryDelay: 500,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
