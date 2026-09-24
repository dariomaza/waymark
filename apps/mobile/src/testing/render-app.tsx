import type { Language } from "@waymark/i18n";
import { cleanup, render, type RenderResult } from "@testing-library/react-native";
import type { QueryClient } from "@tanstack/react-query";
import type { NavigationState, PartialState } from "@react-navigation/native";

import { App, createQueryClient } from "../app/app.js";
import { inMemorySecureStorage, type SecureStorage } from "../auth/secure-storage.js";
import type { Session } from "../auth/session-store.js";
import type { CodeScanner } from "../scanning/code-scanner.js";
import type { PhotoSource } from "../photos/photo-source.js";
import type { Clipboard } from "../ui/clipboard.js";
import { API_URL } from "./api-server.js";
import { fakeClipboard } from "./fake-clipboard.js";
import { fakePhotoSource } from "./fake-photo-source.js";
import { fakeScanner } from "./fake-scanner.js";

export interface RenderAppOptions {
  /**
   * The screen the app opens on, the way `MemoryRouter`'s `initialEntries`
   * are for the web client's tests.
   */
  readonly screen?: { readonly name: string; readonly params?: object };
  /** A session already in the keystore when the app starts. */
  readonly session?: Session;
  /**
   * Stands in for the camera, which a test runner does not have. One is always
   * in place, because Scan is the tab the app opens on; pass one to drive it.
   */
  readonly scanner?: CodeScanner;
  /** Stands in for the camera roll and the camera, for the same reason. */
  readonly photos?: PhotoSource;
  /**
   * Stands in for the system clipboard. Pass one to read what the app put on
   * it — which is the only way to assert that a credential shown once left
   * the screen intact.
   */
  readonly clipboard?: Clipboard;
  /**
   * The language already chosen, sitting in the keystore when the app starts.
   *
   * Seeding it is what reopening a killed app looks like for somebody who
   * picked Spanish last week — and the only way to prove the choice survives,
   * since the store is asynchronous and the naive wiring would render English
   * first and correct itself.
   *
   * It DEFAULTS to English rather than being left absent, which is not a
   * detail. With nothing stored the app asks the device what language it is
   * in, and a developer's laptop set to Spanish would then run the whole
   * suite in Spanish while CI ran it in English — the same test passing in
   * one place and failing in the other for a reason nowhere in the code.
   * Every test states the language it is asserting in; the device fallback is
   * proved on its own in `language.test.ts`, where the locale is stood up
   * deliberately.
   */
  readonly language?: Language;
  /**
   * The keystore itself, for the tests that are ABOUT the keystore.
   *
   * Everything else hands over a session and a language and lets this build
   * one. A test about sealing, unlocking or a cancelled prompt needs to stand
   * the phone up itself — what it holds sealed, whether it has a biometric at
   * all, and what the person at the prompt says — and then watch what was
   * asked of it. Passing one in means seeding the language too, because this
   * is then not the thing doing the seeding.
   */
  readonly storage?: SecureStorage;
}

const SESSION_KEY = "waymark.session";
const LANGUAGE_KEY = "waymark.language";

/**
 * Every query cache a test built, so the setup can throw them away.
 *
 * Unmounting is not enough. A mutation that nobody is observing any more
 * schedules its own collection five minutes out, and `QueryClient.clear()`
 * drops it from the cache WITHOUT cancelling that timer — so a suite that
 * signs in once takes a second to assert and five minutes to exit. Destroying
 * each one first cancels the timer, which is the difference between a test run
 * that ends and one that looks hung.
 */
const caches: QueryClient[] = [];

interface Destroyable {
  destroy(): void;
}

export const discardQueryCaches = (): void => {
  for (const cache of caches.splice(0)) {
    for (const mutation of cache.getMutationCache().getAll()) {
      (mutation as unknown as Destroyable).destroy();
    }
    cache.clear();
  }
};

/**
 * Renders the WHOLE app, at a screen, the way a phone would.
 *
 * Not a screen in isolation: the navigators, the session gate, the query cache
 * and the real `@waymark/api-client` are all in play, and the only things
 * standing in for the outside world are the HTTP stub and the three ports that
 * are genuinely hardware — the keystore, the camera and the photo library.
 *
 * That is what lets a test say "a person scanned a label and ended up looking
 * at that box" rather than "this component rendered".
 */
export const renderApp = async ({
  screen,
  session,
  scanner,
  photos,
  clipboard,
  language,
  storage,
}: RenderAppOptions = {}): Promise<RenderResult> => {
  const state: PartialState<NavigationState> | undefined =
    screen === undefined
      ? undefined
      : {
          index: 0,
          routes: [
            screen.params === undefined
              ? { name: screen.name }
              : { name: screen.name, params: screen.params },
          ],
        };

  const queries = createQueryClient();
  caches.push(queries);

  return await render(
    <App
      baseUrl={API_URL}
      queries={queries}
      storage={
        storage ??
        inMemorySecureStorage({
          ...(session === undefined ? {} : { [SESSION_KEY]: JSON.stringify(session) }),
          [LANGUAGE_KEY]: language ?? "en",
        })
      }
      {...(state === undefined ? {} : { initialState: state })}
      scanner={scanner ?? fakeScanner()}
      photos={photos ?? fakePhotoSource()}
      clipboard={clipboard ?? fakeClipboard()}
    />,
  );
};

/**
 * The same phone, killed and opened again.
 *
 * A cold start is the only way to prove what a setting LEFT BEHIND: turning
 * the fingerprint off is a claim about the next launch, and the next launch is
 * a fresh store reading the same keystore. Hand it the storage the first run
 * was given and it opens on whatever that run actually wrote.
 *
 * The teardown is not optional and is the whole reason this is a helper. A
 * second `render` on top of a tree that is still settling gives React
 * overlapping `act()` scopes and the query cache goes on notifying an
 * unmounted screen — which fails the NEXT test in the file, with a message
 * about the wrong one. So the old tree is unmounted and awaited, and its cache
 * is destroyed, before anything is rendered again.
 */
export const relaunchApp = async (
  options: RenderAppOptions = {},
): Promise<RenderResult> => {
  await cleanup();
  discardQueryCaches();

  return await renderApp(options);
};

/**
 * `fireEvent` rather than `userEvent`.
 *
 * `userEvent` is the more faithful of the two and it is what this suite
 * started with. Under this runner it leaves a handle pending for five minutes
 * after the assertions finish, so a suite that takes a second to run takes
 * five minutes to exit — and a test run that does not end is worse than one
 * that simulates a tap slightly more coarsely.
 *
 * What is lost is the press-in/press-out timing and the per-character key
 * events; what is kept is the thing that matters here, which is that every
 * element is found by its accessible ROLE and LABEL and driven through the
 * app's own handlers.
 */
export {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
