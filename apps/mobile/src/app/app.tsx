import { FailureKind, failureKindOf, queryKeys } from "@ariadna/api-client";
import {
  NavigationContainer,
  type NavigationState,
  type PartialState,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useState, type JSX } from "react";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";

import { ApiProvider, useApi } from "../api/api-context.js";
import { LoginScreen } from "../auth/login-screen.js";
import { SessionProvider } from "../auth/session-context.js";
import { expoSecureStorage, type SecureStorage } from "../auth/secure-storage.js";
import { createSessionStore } from "../auth/session-store.js";
import { useSessionState, useSignOut } from "../auth/use-session.js";
import { AllItemsScreen } from "../items/all-items-screen.js";
import { ItemScreen } from "../items/item-screen.js";
import { expoPhotoSource } from "../photos/expo-photo-source.js";
import { PhotoSourceProvider } from "../photos/photo-source-context.js";
import type { PhotoSource } from "../photos/photo-source.js";
import type { CodeScanner } from "../scanning/code-scanner.js";
import { expoCameraScanner } from "../scanning/expo-camera-scanner.js";
import { ScanScreen } from "../scanning/scan-screen.js";
import { ScannedLabelScreen } from "../scanning/scanned-label-screen.js";
import { ScannerProvider } from "../scanning/scanner-context.js";
import { SearchScreen } from "../search/search-screen.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { Screen } from "../ui/organisms/screen.js";
import { colors } from "../ui/styles/tokens.js";
import { InventoryScreen } from "../units/inventory-screen.js";
import { LabelScreen } from "../units/label-screen.js";
import { UnitScreen } from "../units/unit-screen.js";
import { createDefaultClient } from "./create-client.js";
import { linking, type RootStackParamList, type TabParamList } from "./navigation.js";

export interface AppProps {
  /** Where the API is. The composition root's one piece of configuration. */
  readonly baseUrl?: string;
  /**
   * The Android Keystore, the camera and the photo library. All three are
   * ports because all three are the operating system, and none of them exists
   * under a test runner. See each port for why that is not the same as
   * stubbing the app's own code.
   */
  readonly storage?: SecureStorage;
  readonly scanner?: CodeScanner;
  readonly photos?: PhotoSource;
  /** Where the app opens, for the tests. A phone always starts at the tabs. */
  readonly initialState?: PartialState<NavigationState>;
  /**
   * The query cache. Built here by default; handed in by a test, which needs
   * to be able to throw it away — an unused query schedules its collection
   * five minutes out, and five minutes of pending timers is a test run that
   * does not end.
   */
  readonly queries?: QueryClient;
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

/**
 * # The composition root
 *
 * Everything the app can DO lives in a folder named after it — `auth`,
 * `units`, `items`, `search`, `scanning`, `photos`. This file is the only one
 * that knows they all exist: it builds the ports, wires the providers around
 * them and lays out the screens. No feature folder imports another feature's
 * screens, so what the app does stays readable from the directory listing.
 */
export const App = ({
  baseUrl,
  storage,
  scanner,
  photos,
  initialState,
  queries: given,
}: AppProps = {}): JSX.Element => {
  const [queries] = useState(() => given ?? createQueryClient());
  const [sessions] = useState(() => createSessionStore(storage ?? expoSecureStorage()));
  const [api] = useState(() => createDefaultClient(sessions, baseUrl));
  const [camera] = useState(() => scanner ?? expoCameraScanner());
  const [photoSource] = useState(() => photos ?? expoPhotoSource());

  return (
    // `initialMetrics` rather than a measurement: without it the first frame
    // is an empty screen while the insets are read, which on a cold start is a
    // black flash before the camera.
    <SafeAreaProvider initialMetrics={initialWindowMetrics ?? TEST_METRICS}>
      <StatusBar style="light" />
      <QueryClientProvider client={queries}>
        <SessionProvider store={sessions}>
          <ApiProvider client={api}>
            <ScannerProvider scanner={camera}>
              <PhotoSourceProvider source={photoSource}>
                <SessionGate initialState={initialState} />
              </PhotoSourceProvider>
            </ScannerProvider>
          </ApiProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
};

/**
 * # The gate every screen but the login sits behind
 *
 * The navigator is not mounted until there is a session. That is what makes
 * the scanned-label flow work with no destination to remember: a phone opens
 * `<base>/u/<code>` from the stock camera, the app launches with no session
 * and shows this login screen; the moment the password is in, the navigator
 * mounts and React Navigation reads the launch URL for the first time — so it
 * lands on that box rather than on a home screen. Landing somebody on a home
 * screen after they scanned a specific box is the difference between the
 * flagship feature working and feeling broken.
 *
 * It also means no protected screen ever fires a request without a token, so a
 * signed-out phone never produces a screenful of 401s.
 *
 * There are three states here and not two. The keystore is asynchronous, so
 * until the first read comes back the honest answer is neither signed in nor
 * signed out — and collapsing that into "signed out" would flash the login
 * screen at somebody who is signed in, on every cold start.
 */
const SessionGate = ({
  initialState,
}: {
  readonly initialState: PartialState<NavigationState> | undefined;
}): JSX.Element => {
  const state = useSessionState();

  if (state.status === "unknown") {
    return (
      <Screen scroll={false}>
        <Loading label="Opening Ariadna" />
      </Screen>
    );
  }

  if (state.session === null) {
    return <LoginScreen />;
  }

  return <ConfirmedSession token={state.session.token} initialState={initialState} />;
};

/**
 * # A token this phone holds, and the API's opinion of it
 *
 * A session is a revocable row (ADR 6), so a token can stop working at any
 * moment — and this one has been sitting in a keystore since the last time the
 * app was opened, which may have been a month ago. Asking once on entry means
 * that is discovered on a splash rather than halfway through a delete: the
 * client clears the session the instant a 401 comes back, which lands on the
 * login screen above.
 *
 * Being unable to REACH the API is neither. The session is not over because
 * the wifi is; the app opens on what it already had, and each screen says for
 * itself what it could not load.
 */
const ConfirmedSession = ({
  token,
  initialState,
}: {
  readonly token: string;
  readonly initialState: PartialState<NavigationState> | undefined;
}): JSX.Element => {
  const api = useApi();
  const signOut = useSignOut();

  const check = useQuery({
    // The token is part of the key so a fresh sign-in is a fresh question,
    // rather than the cached refusal of the token that came before it.
    queryKey: queryKeys.session(token),
    queryFn: async () => await api.me(),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (check.isPending) {
    return (
      <Screen scroll={false}>
        <Loading label="Checking your session" />
      </Screen>
    );
  }

  if (check.isError && failureKindOf(check.error) !== FailureKind.OFFLINE) {
    return (
      <Screen>
        <Callout
          tone="wrong"
          title="Ariadna could not confirm your session"
          action={
            <Button
              tone="primary"
              onPress={() => {
                signOut.mutate();
              }}
            >
              Sign in again
            </Button>
          }
        >
          {check.error.message}
        </Callout>
      </Screen>
    );
  }

  return (
    <NavigationContainer
      linking={linking}
      theme={NAVIGATION_THEME}
      {...(initialState === undefined ? {} : { initialState })}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Unit" component={UnitScreen} />
        <Stack.Screen name="Item" component={ItemScreen} />
        <Stack.Screen name="Label" component={LabelScreen} />
        {/* The address printed on every box. See the screen. */}
        <Stack.Screen name="ScannedLabel" component={ScannedLabelScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

/**
 * Scan first.
 *
 * The bar is at the bottom where the thumb is, and the camera is the tab it
 * opens on: the product is a printed QR on a box and a phone pointed at it,
 * and burying that behind a menu would be burying the reason the app exists.
 */
const Tabs = (): JSX.Element => (
  <Tab.Navigator
    initialRouteName="Scan"
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.inkMuted,
      tabBarStyle: { backgroundColor: colors.surfaceRaised, borderTopColor: colors.line },
    }}
  >
    {/*
      * Each tab states its accessible name rather than leaving it to be
      * inferred from the label under the icon. A bar of four one-word buttons
      * is exactly where an inferred name goes missing, and the name is what a
      * screen reader announces and what a test asks for.
      */}
    <Tab.Screen
      name="Scan"
      component={ScanScreen}
      options={{ title: "Scan", tabBarAccessibilityLabel: "Scan" }}
    />
    <Tab.Screen
      name="Inventory"
      component={InventoryScreen}
      options={{ title: "Inventory", tabBarAccessibilityLabel: "Inventory" }}
    />
    <Tab.Screen
      name="Search"
      component={SearchScreen}
      options={{ title: "Search", tabBarAccessibilityLabel: "Search" }}
    />
    <Tab.Screen
      name="Items"
      component={AllItemsScreen}
      options={{ title: "Items", tabBarAccessibilityLabel: "Everything you own" }}
    />
  </Tab.Navigator>
);

/**
 * What a phone reports before it has been asked. Only ever used where there is
 * no window to measure, which is a test runner.
 */
const TEST_METRICS = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const NAVIGATION_THEME = {
  dark: true,
  colors: {
    primary: colors.accent,
    background: colors.surface,
    card: colors.surfaceRaised,
    text: colors.ink,
    border: colors.line,
    notification: colors.danger,
  },
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" },
    medium: { fontFamily: "System", fontWeight: "500" },
    bold: { fontFamily: "System", fontWeight: "700" },
    heavy: { fontFamily: "System", fontWeight: "900" },
  },
} as const;

/**
 * # Retrying, and why there is so little of it
 *
 * A refusal is not a flake. A 409 means the box is not empty and a 422 means
 * the request is wrong; asking again changes neither, it just delays the
 * sentence that would have told somebody what to do. Only a request that never
 * left the phone is worth repeating, and only once — after that the screen
 * says so and offers a button, which in a garage with one bar of signal is
 * more honest than a spinner that hides ten seconds of failure.
 *
 * `networkMode: "always"` for the same reason. By default this library PAUSES
 * every request while it believes the device is offline, which leaves a screen
 * spinning with no explanation — and that flag is a statement about an
 * interface being up, not about whether a homelab behind a tunnel can be
 * reached. So every request is attempted, and one that cannot leave the phone
 * comes back as the offline failure the screens already handle (ADR 13).
 */
export const createQueryClient = (): QueryClient =>
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
