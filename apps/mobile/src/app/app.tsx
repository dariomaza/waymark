import { FailureKind, failureKindOf, queryKeys } from "@waymark/api-client";
import {
  NavigationContainer,
  type NavigationState,
  type PartialState,
} from "@react-navigation/native";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { useMemo, useState, type JSX } from "react";
import {
  initialWindowMetrics,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { AccountScreen } from "../account/account-screen.js";
import { ApiProvider, useApi } from "../api/api-context.js";
import { LoginScreen } from "../auth/login-screen.js";
import { SessionProvider } from "../auth/session-context.js";
import { expoSecureStorage, type SecureStorage } from "../auth/secure-storage.js";
import { createSessionStore } from "../auth/session-store.js";
import { useSessionState, useSignOut } from "../auth/use-session.js";
import { AllItemsScreen } from "../items/all-items-screen.js";
import { ItemScreen } from "../items/item-screen.js";
import { expoPhotoSource } from "../photos/expo-photo-source.js";
import { PhotoProcessingScreen } from "../photos/processing-screen.js";
import { PhotoSourceProvider } from "../photos/photo-source-context.js";
import type { PhotoSource } from "../photos/photo-source.js";
import type { CodeScanner } from "../scanning/code-scanner.js";
import { expoCameraScanner } from "../scanning/expo-camera-scanner.js";
import { ScanScreen } from "../scanning/scan-screen.js";
import { ScannedLabelScreen } from "../scanning/scanned-label-screen.js";
import { ScannerProvider } from "../scanning/scanner-context.js";
import { SearchScreen } from "../search/search-screen.js";
import { Avatar } from "../ui/atoms/avatar.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Icon, type IconName } from "../ui/atoms/icon.js";
import { expoClipboard, type Clipboard } from "../ui/clipboard.js";
import { ClipboardProvider } from "../ui/clipboard-context.js";
import { Loading } from "../ui/atoms/loading.js";
import { AppBar } from "../ui/organisms/app-bar.js";
import { Screen } from "../ui/organisms/screen.js";
import { colors } from "../ui/styles/tokens.js";
import { InventoryScreen } from "../units/inventory-screen.js";
import { LabelScreen } from "../units/label-screen.js";
import { UnitScreen } from "../units/unit-screen.js";
import { createDefaultClient } from "./create-client.js";
import { createLanguageStore } from "./language.js";
import { LanguageProvider, useTranslate } from "./language-context.js";
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
  /**
   * The system clipboard. A port for the same reason the other three are: it
   * is a native module, and a machine token nobody can copy is a machine
   * token nobody can use.
   */
  readonly clipboard?: Clipboard;
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
  clipboard,
  initialState,
  queries: given,
}: AppProps = {}): JSX.Element => {
  const [queries] = useState(() => given ?? createQueryClient());
  // One store for the whole phone: the session, and the one preference there
  // is. See `language.ts` for why a language code lives in the keystore.
  const [store] = useState(() => storage ?? expoSecureStorage());
  const [sessions] = useState(() => createSessionStore(store));
  const [languages] = useState(() => createLanguageStore(store));
  const [api] = useState(() => createDefaultClient(sessions, baseUrl));
  const [camera] = useState(() => scanner ?? expoCameraScanner());
  const [photoSource] = useState(() => photos ?? expoPhotoSource());
  const [board] = useState(() => clipboard ?? expoClipboard());

  return (
    // `initialMetrics` rather than a measurement: without it the first frame
    // is an empty screen while the insets are read, which on a cold start is a
    // black flash before the camera.
    <SafeAreaProvider initialMetrics={initialWindowMetrics ?? TEST_METRICS}>
      <StatusBar style="light" />
      <LanguageProvider store={languages}>
        <QueryClientProvider client={queries}>
          <SessionProvider store={sessions}>
            <ApiProvider client={api}>
              <ScannerProvider scanner={camera}>
                <PhotoSourceProvider source={photoSource}>
                  <ClipboardProvider clipboard={board}>
                    <SessionGate initialState={initialState} />
                  </ClipboardProvider>
                </PhotoSourceProvider>
              </ScannerProvider>
            </ApiProvider>
          </SessionProvider>
        </QueryClientProvider>
      </LanguageProvider>
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
  const t = useTranslate();

  if (state.status === "unknown") {
    return (
      <Screen scroll={false}>
        <Loading label={t("shell.opening")} />
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
  const t = useTranslate();
  const insets = useSafeAreaInsets();

  /**
   * What the tree under the bar is told the insets are.
   *
   * The top one is SPENT: `AppBar` pads itself by it, so by the time anything
   * below the bar is drawn there is no clock left to be underneath. Saying so
   * here is what lets `Screen` keep the inset by default — right for the
   * sign-in screen and the loading states, which have no bar above them —
   * without opening a second status bar's worth of nothing under the bar on
   * every screen in the app.
   *
   * The bottom is untouched, and belongs to the tab bar, which reads it from
   * this same context and pads itself off the gesture bar with it.
   */
  const belowTheBar = useMemo(() => ({ ...insets, top: 0 }), [insets]);

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
        <Loading label={t("shell.checkingSession")} />
      </Screen>
    );
  }

  if (check.isError && failureKindOf(check.error) !== FailureKind.OFFLINE) {
    return (
      <Screen>
        <Callout
          tone="wrong"
          title={t("session.unconfirmed")}
          action={
            <Button
              tone="primary"
              onPress={() => {
                signOut.mutate();
              }}
            >
              {t("session.signInAgain")}
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
      {/*
        * The bar sits OUTSIDE the navigator rather than as a screen header,
        * so it is one bar that never redraws between screens — the same frame
        * the web client's shell puts around every signed-in route. Each
        * screen keeps drawing its own title; this one says which product you
        * are in, and nothing else.
        *
        * It used to carry the language too. Two permanently visible buttons,
        * on every screen, for a choice made roughly once — they now live
        * behind the avatar in the bottom bar, with the rest of what belongs
        * to a person rather than to an inventory.
        */}
      <AppBar title="Waymark" />
      <SafeAreaInsetsContext.Provider value={belowTheBar}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="Unit" component={UnitScreen} />
          <Stack.Screen name="Item" component={ItemScreen} />
          <Stack.Screen name="Label" component={LabelScreen} />
          {/* The address printed on every box. See the screen. */}
          <Stack.Screen name="ScannedLabel" component={ScannedLabelScreen} />
          {/*
            * Reached from the note under a photo whose background removal
            * failed, which is the moment the question it answers gets asked.
            */}
          <Stack.Screen name="Processing" component={PhotoProcessingScreen} />
        </Stack.Navigator>
      </SafeAreaInsetsContext.Provider>
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
const Tabs = (): JSX.Element => {
  const t = useTranslate();
  const state = useSessionState();
  const username = state.status === "known" ? (state.session?.user.username ?? "") : "";

  return (
    <Tab.Navigator
      initialRouteName="Scan"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.surfaceRaised, borderTopColor: colors.line },
        tabBarButton: currentTabIsUnderlined,
      }}
    >
      {/*
        * Each tab states its accessible name rather than leaving it to be
        * inferred from the label under the icon. A bar of four one-word buttons
        * is exactly where an inferred name goes missing, and the name is what a
        * screen reader announces and what a test asks for.
        *
        * The name is the WORD, never a description of the drawing: "cube icon"
        * describes the shape and withholds the destination. It is the same word
        * as the title on purpose — two spellings of one destination is how a
        * screen reader and a pair of eyes come to disagree about where a button
        * goes — so both come from one key.
        */}
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          title: t("nav.scan"),
          tabBarAccessibilityLabel: t("nav.scan"),
          tabBarIcon: tabIcon("scan"),
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{
          title: t("nav.places"),
          tabBarAccessibilityLabel: t("nav.places"),
          tabBarIcon: tabIcon("tree"),
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          title: t("nav.search"),
          tabBarAccessibilityLabel: t("nav.search"),
          tabBarIcon: tabIcon("search"),
        }}
      />
      <Tab.Screen
        name="Items"
        component={AllItemsScreen}
        options={{
          title: t("nav.things"),
          tabBarAccessibilityLabel: t("nav.things"),
          tabBarIcon: tabIcon("things"),
        }}
      />
      {/*
        * The fifth destination, and the only one that is not a place to look
        * for a thing.
        *
        * It is drawn as the person's initial rather than as a ninth icon,
        * because no shape in any vocabulary means "your account" — a
        * silhouette means "a person", which is the wrong person — and a
        * circle with your own initial in it is the one thing every product
        * has already taught everybody to read.
        *
        * The word under it is still "You". The NAME announced beside it is
        * the whole sentence, because "DM" read aloud is two letters and a
        * screen reader landing here should learn who is signed in rather than
        * be given the abbreviation to work out.
        */}
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          title: t("nav.you"),
          tabBarAccessibilityLabel: t("nav.youNamed", { username }),
          tabBarIcon: ({ color }: { readonly color: string }) => (
            <Avatar name={username} color={color} size={24} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

/**
 * # Which tab you are on, stated twice
 *
 * A tint and nothing else is a colour difference, and a colour difference is
 * the one kind that goes missing in bright sunlight, on a cheap panel, and for
 * roughly one man in twelve. The web client has always drawn a 2px rule along
 * the top edge of the tab you are on as well; this is that rule.
 *
 * Every tab carries it, transparent, so that arriving on one moves a colour
 * rather than moving the icons down two pixels.
 *
 * `accentText` and not `accent`: the rule is a foreground mark, which is the
 * job that token names — the same one the web client's `--color-accent-text`
 * does on the same rule. They are the same lime on this app's one scheme.
 *
 * `PlatformPressable` is what the navigator itself reaches for when nobody
 * hands it a button, so the ripple, the hover and the press behaviour are the
 * stock ones; the only thing added is the style. The focused flag arrives as
 * `aria-selected`, which is what the navigator puts on the button it builds.
 */
const currentTabIsUnderlined = (props: BottomTabBarButtonProps): JSX.Element => (
  <PlatformPressable
    {...props}
    style={[
      props.style,
      styles.tab,
      props["aria-selected"] === true ? styles.currentTab : null,
    ]}
  />
);

const styles = StyleSheet.create({
  tab: { borderTopWidth: 2, borderTopColor: "transparent" },
  currentTab: { borderTopColor: colors.accentText },
});

/**
 * A destination's drawing, in the colour the bar says it is.
 *
 * Hidden from assistive technology on purpose — the word is right underneath
 * in the same button, and announcing the picture and the word would say the
 * same thing twice. The ROUTE names stay `Inventory` and `Items`: they are
 * this app's internal addresses, the way the web client's paths are, and
 * renaming an address to rename a label is how deep links break.
 */
const tabIcon =
  (name: IconName) =>
  ({ color }: { readonly color: string }): JSX.Element => (
    <Icon name={name} color={color} size={22} />
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
