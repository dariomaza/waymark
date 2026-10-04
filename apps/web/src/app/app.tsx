import { ApiError, ApiErrorCode, FailureKind, failureKindOf } from "@waymark/api-client";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { Route, Routes } from "react-router-dom";

import { ApiProvider } from "../api/api-context.js";
import type { WebApiClient } from "../api/web-client.js";
import { LoginScreen } from "../auth/login-screen.js";
import { defaultPasskeyPlatform, PasskeyProvider } from "../auth/passkey-context.js";
import type { PasskeyPlatform } from "../auth/passkey-platform.js";
import { RequireSession } from "../auth/require-session.js";
import { AccountScreen } from "../account/account-screen.js";
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
import { ThemeProvider } from "./theme-context.js";
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
  /**
   * The fingerprint prompt. Injected for the same reason the camera is: jsdom
   * has no `navigator.credentials`, and what is being stood in for is a piece
   * of hardware and a platform dialog rather than this app's own code.
   */
  readonly passkeys?: PasskeyPlatform;
  /**
   * The query cache, built by `createQueryClient` by default. Tests build
   * their own with that same function so they keep the real retry policy and
   * drop only its wall-clock wait — see `createQueryClient`.
   */
  readonly queries?: QueryClient;
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
export const App = ({
  client,
  scanner,
  passkeys,
  queries: given,
}: AppProps = {}): JSX.Element => {
  const [queries] = useState(() => given ?? createQueryClient());
  const [api] = useState(() => client ?? createDefaultClient());
  const [camera] = useState(() => scanner ?? defaultScanner());
  const [authenticators] = useState(() => passkeys ?? defaultPasskeyPlatform());

  return (
    <ThemeProvider>
    <LanguageProvider>
      <QueryClientProvider client={queries}>
        <ApiProvider client={api}>
          <ScannerProvider scanner={camera}>
            <PasskeyProvider platform={authenticators}>
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
                  {/*
                    * The fifth destination in the bar, and the only one that is
                    * not a place to look for a thing.
                    */}
                  <Route path={ROUTES.account} element={<AccountScreen />} />
                  <Route path={ROUTES.scannedLabel} element={<ScannedLabelScreen />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
            </PasskeyProvider>
          </ScannerProvider>
        </ApiProvider>
      </QueryClientProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
};

/** How long a phone waits before asking again for a request that never left it. */
export const OFFLINE_RETRY_DELAY_MS = 500;

export interface QueryClientOptions {
  /**
   * How long to wait before the one retry, in milliseconds. A phone waits
   * `OFFLINE_RETRY_DELAY_MS`. The tests pass 0: the wait is real time, and a
   * test that sits through it spends half of a `findBy…`'s one second doing
   * nothing, so any stall of the test process during the wait lets the retry
   * and the assertion's deadline fall due together — and the deadline wins.
   */
  readonly offlineRetryDelay?: number;
}

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
export const createQueryClient = ({
  offlineRetryDelay = OFFLINE_RETRY_DELAY_MS,
}: QueryClientOptions = {}): QueryClient => {
  /**
   * # A refusal that means "choose your password first" (ADR 26, amended)
   *
   * An administrator can reset a password while the app is open. The next
   * request is refused 403 `PASSWORD_CHANGE_REQUIRED` — which is NOT the end
   * of the session, so nothing here signs anybody out. `/auth/me` is asked
   * again instead, it says `mustChangePassword`, and the session gate draws
   * the screen that chooses one.
   */
  const onError = (error: unknown): void => {
    if (error instanceof ApiError && error.code === ApiErrorCode.PASSWORD_CHANGE_REQUIRED) {
      // `queryKeys.session(token)` is `["session", token]`: every session asked.
      void queries.invalidateQueries({ queryKey: ["session"] });
    }
  };

  const queries: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: (failureCount, error) =>
          failureKindOf(error) === FailureKind.OFFLINE && failureCount < 1,
        retryDelay: offlineRetryDelay,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { networkMode: "always", retry: false },
    },
  });

  return queries;
};
