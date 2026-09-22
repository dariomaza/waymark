import { FailureKind, failureKindOf } from "@ariadna/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { Route, Routes } from "react-router-dom";

import { ApiProvider } from "../api/api-context.js";
import type { WebApiClient } from "../api/web-client.js";
import { LoginScreen } from "../auth/login-screen.js";
import { RequireSession } from "../auth/require-session.js";
import { AllItemsScreen } from "../items/all-items-screen.js";
import { ItemScreen } from "../items/item-screen.js";
import { PhotoProcessingScreen } from "../photos/processing-screen.js";
import type { QrScanner } from "../scanning/qr-scanner.js";
import { ScanScreen } from "../scanning/scan-screen.js";
import { ScannedLabelScreen } from "../scanning/scanned-label-screen.js";
import { defaultScanner, ScannerProvider } from "../scanning/scanner-context.js";
import { SearchScreen } from "../search/search-screen.js";
import { InventoryScreen } from "../units/inventory-screen.js";
import { LabelScreen } from "../units/label-screen.js";
import { LabelSheetScreen } from "../units/label-sheet-screen.js";
import { UnitScreen } from "../units/unit-screen.js";
import { AppShell } from "./app-shell.js";
import { LanguageProvider } from "./language-context.js";
import { createDefaultClient } from "./create-client.js";
import { NotFoundScreen } from "./not-found-screen.js";
import { ROUTES } from "./routes.js";

export interface AppProps {
  /**
   * The composition root builds one by default. Tests do not replace it —
   * they answer the network with MSW instead — but a client pointed at a
   * different API is the one thing worth being able to inject.
   */
  readonly client?: WebApiClient;
  /**
   * The camera. Injected because jsdom has none: see `qr-scanner.ts` for why
   * that is a port and not a stubbed module.
   */
  readonly scanner?: QrScanner;
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
export const App = ({ client, scanner }: AppProps = {}): JSX.Element => {
  const [queries] = useState(createQueryClient);
  const [api] = useState(() => client ?? createDefaultClient());
  const [camera] = useState(() => scanner ?? defaultScanner());

  return (
    <LanguageProvider>
      <QueryClientProvider client={queries}>
        <ApiProvider client={api}>
          <ScannerProvider scanner={camera}>
            <Routes>
              <Route path={ROUTES.login} element={<LoginScreen />} />

              <Route element={<RequireSession />}>
                <Route element={<AppShell />}>
                  <Route path={ROUTES.inventory} element={<InventoryScreen />} />
                  <Route path={ROUTES.find} element={<SearchScreen />} />
                  <Route path={ROUTES.scan} element={<ScanScreen />} />
                  <Route path={ROUTES.unit} element={<UnitScreen />} />
                  <Route path={ROUTES.unitLabel} element={<LabelScreen />} />
                  <Route path={ROUTES.labels} element={<LabelSheetScreen />} />
                  <Route path={ROUTES.everything} element={<AllItemsScreen />} />
                  <Route path={ROUTES.thing} element={<ItemScreen />} />
                  <Route
                    path={ROUTES.backgroundRemoval}
                    element={<PhotoProcessingScreen />}
                  />
                  <Route path={ROUTES.scannedLabel} element={<ScannedLabelScreen />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
          </ScannerProvider>
        </ApiProvider>
      </QueryClientProvider>
    </LanguageProvider>
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
 *
 * `networkMode: "always"` for the same reason. By default this library
 * PAUSES every request while `navigator.onLine` is false, which leaves a
 * screen spinning with no explanation — and that flag is a statement about
 * an interface being up, not about whether a homelab behind a tunnel can be
 * reached. So every request is attempted, and a request that cannot leave
 * the phone comes back as the offline failure the screens already handle.
 */
const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: (failureCount, error) =>
          failureKindOf(error) === FailureKind.OFFLINE && failureCount < 1,
        retryDelay: 500,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { networkMode: "always", retry: false },
    },
  });
