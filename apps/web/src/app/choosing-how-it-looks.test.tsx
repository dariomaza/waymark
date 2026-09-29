import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup } from "@testing-library/react";
import { DARK, LIGHT } from "@waymark/tokens";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, within } from "../testing/render-app.js";
import { themeStore } from "./theme.js";

/**
 * # Light, dark, or whatever the device says (ADR 25)
 *
 * The browser used to follow `prefers-color-scheme` and offer nothing else, so
 * somebody on a dark laptop who wanted the light page — or the other way round
 * — had no way to get it. These are the tests that say a person can choose,
 * that the page follows the choice, and that the choice is still there after
 * a reload.
 *
 * What is painted is asked of the cascade: the generated stylesheet goes into
 * the document and `--color-surface` is read off the root, which is the colour
 * the page's background is. jsdom evaluates no media query, so "the system is
 * light" can only be stood up through `matchMedia`, and is asserted through the
 * one thing that reads it here: the browser's own bar colour.
 */
const TOKENS = readFileSync(join(process.cwd(), "src/ui/styles/tokens.css"), "utf8");

const withStorage = (): Storage => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  } as unknown as Storage;

  vi.stubGlobal("localStorage", storage);

  return storage;
};

/** A device whose scheme a test can flip, the way somebody's evening does. */
const deviceIn = (initial: "light" | "dark"): { flip: (to: "light" | "dark") => void } => {
  let scheme = initial;
  const listeners = new Set<() => void>();

  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("light") ? scheme === "light" : scheme === "dark";
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));

  return {
    flip: (to) => {
      scheme = to;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

/** The page's own background, as the cascade resolves it right now. */
const pageSurface = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim();

/** What the browser paints its own bar with, from `<meta name="theme-color">`. */
const browserBar = (): string | null =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null;

const openAccount = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const user = userEvent.setup();
  renderApp({ route: "/" });

  await user.click(await screen.findByRole("link", { name: /you, signed in as dario/i }));
  await screen.findByRole("heading", { name: /^you$/i });

  return user;
};

const appearance = (): HTMLElement => screen.getByRole("group", { name: "Appearance" });

beforeEach(() => {
  document.head.innerHTML = `<style>${TOKENS}</style><meta name="theme-color" content="" />`;
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({ tree: [aTree(aStorageUnit({ id: "garage", name: "Garage" }))] }),
    ),
    http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
    http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  themeStore.forget();
  delete document.documentElement.dataset["theme"];
});

describe("choosing how the app looks", () => {
  it("offers the device's own scheme, light and dark, and follows the device until asked", async () => {
    await openAccount();

    const group = within(appearance());
    expect(group.getByRole("radio", { name: "System" })).toBeChecked();
    expect(group.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(group.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("paints the page light the moment Light is picked, on a dark device", async () => {
    deviceIn("dark");
    const user = await openAccount();
    expect(pageSurface()).toBe(DARK.surface);

    await user.click(within(appearance()).getByRole("radio", { name: "Light" }));

    expect(pageSurface()).toBe(LIGHT.surface);
    expect(within(appearance()).getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("goes back to the dark when Dark is picked", async () => {
    const user = await openAccount();

    await user.click(within(appearance()).getByRole("radio", { name: "Light" }));
    await user.click(within(appearance()).getByRole("radio", { name: "Dark" }));

    expect(pageSurface()).toBe(DARK.surface);
  });

  /**
   * The media query is the stylesheet's business and jsdom cannot evaluate it
   * (`a-scheme-can-be-chosen.test.ts` in the tokens package holds the CSS to
   * the rule). What this client decides is the browser's bar, and that has to
   * follow the device live while System is the choice, and stop following it
   * the moment something else is.
   */
  it("follows the device while System is chosen, and stops once something else is", async () => {
    const device = deviceIn("light");
    const user = await openAccount();

    expect(browserBar()).toBe(LIGHT.surface);

    device.flip("dark");
    expect(browserBar()).toBe(DARK.surface);

    await user.click(within(appearance()).getByRole("radio", { name: "Light" }));
    device.flip("dark");

    expect(browserBar()).toBe(LIGHT.surface);
  });

  it("paints the browser's bar in the dark on a light device when Dark is chosen", async () => {
    deviceIn("light");
    const user = await openAccount();

    await user.click(within(appearance()).getByRole("radio", { name: "Dark" }));

    expect(browserBar()).toBe(DARK.surface);
  });

  /**
   * The point of storing it. `renderApp` builds the whole app from scratch
   * against a store that already holds the choice, which is what a reload is.
   */
  it("is still light after a reload, for somebody who chose light", async () => {
    withStorage();
    const user = await openAccount();
    await user.click(within(appearance()).getByRole("radio", { name: "Light" }));

    cleanup();
    delete document.documentElement.dataset["theme"];
    await openAccount();

    expect(pageSurface()).toBe(LIGHT.surface);
    expect(within(appearance()).getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("speaks the setting in the language chosen", async () => {
    const user = await openAccount();

    await user.click(screen.getByRole("radio", { name: /español/i }));

    const group = within(screen.getByRole("group", { name: "Apariencia" }));
    expect(group.getByRole("radio", { name: "Sistema" })).toBeChecked();
    expect(group.getByRole("radio", { name: "Claro" })).toBeVisible();
    expect(group.getByRole("radio", { name: "Oscuro" })).toBeVisible();
  });
});

/**
 * # Before the first paint
 *
 * The app's bundle is a module, and a module runs after the document has been
 * parsed — late enough for a browser to paint the page once in the system's
 * scheme and then flip it. So a small classic script in `public/` sets the
 * attribute from the stored choice before anything is drawn. It cannot be
 * inline: the document's policy is `script-src 'self'` with no
 * `'unsafe-inline'`, and a same-origin file is what that policy allows.
 *
 * It is a second reader of the same key, so these hold it to the first one.
 */
describe("the page, before the app has started", () => {
  const SCRIPT = readFileSync(join(process.cwd(), "public/theme.js"), "utf8");
  const runBeforePaint = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function(SCRIPT)();
  };

  it.each(["light", "dark"] as const)("is already %s for somebody who chose it", (choice) => {
    withStorage();
    themeStore.save(choice);

    runBeforePaint();

    expect(document.documentElement.dataset["theme"]).toBe(choice);
  });

  it.each(["system", "sepia", null])(
    "leaves the device in charge when the stored choice is %s",
    (stored) => {
      const storage = withStorage();
      if (stored !== null) {
        storage.setItem("waymark.theme", stored);
      }

      runBeforePaint();

      expect(document.documentElement.dataset["theme"]).toBeUndefined();
    },
  );

  it("draws the page anyway where the browser refuses to open its storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });

    expect(runBeforePaint).not.toThrow();
    expect(document.documentElement.dataset["theme"]).toBeUndefined();
  });

  it("is loaded by the page before its stylesheet and its bundle", () => {
    const page = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const script = page.indexOf('<script src="/theme.js"></script>');

    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(page.indexOf('<script type="module"'));
    expect(page.slice(0, script)).not.toMatch(/<link rel="stylesheet"/u);
  });
});

/**
 * # A word is never painted in the lime fill
 *
 * `--color-accent` is a FILL, and in the dark it happens to be the same lime as
 * `--color-accent-text`, so a word painted with the wrong one looks right on
 * every screen anybody checked at night. On the light page it is 1.26 against
 * the surface — not a word but a stain. Two had got through: the place a search
 * hit is in, and the word "Cover" on a photo.
 */
describe("the words on every screen", () => {
  const sheets = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);

      return entry.isDirectory() ? sheets(path) : path.endsWith(".css") ? [path] : [];
    });

  it("are never the lime fill, which cannot be read on the light page", () => {
    const offenders = sheets(join(process.cwd(), "src"))
      .filter((path) => /(^|[\s;{])color:\s*var\(--color-accent\)/mu.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(process.cwd().length + 1));

    expect(offenders).toEqual([]);
  });
});
