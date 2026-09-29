import { aSession } from "@waymark/api-client/testing";
import { DARK, LIGHT, LOGO } from "@waymark/tokens";
import { render } from "@testing-library/react-native";
import { StatusBar } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { SchemeProvider } from "../ui/styles/theme.js";

import { inMemorySecureStorage } from "../auth/secure-storage.js";
import { fakeDeviceScheme } from "../testing/fake-device-scheme.js";
import { act, fireEvent, relaunchApp, renderApp, screen, within } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # Light, dark, or whatever the phone says (ADR 25)
 *
 * This client was dark only, by a decision that argued from one screen: the
 * camera, which is black either way. Every other screen is read, not aimed,
 * and the owner asked for a light scheme and a way to choose on both clients.
 * So the phone now follows its own system setting by default, and the account
 * screen can override it — the same three answers, in the same order, as the
 * browser.
 *
 * What is painted is asked of what is drawn: the screen's own heading is in
 * the scheme's ink, and the bar across the bottom is on its raised surface.
 * The phone's own setting is a port (`device-scheme.ts`) with a fake, like the
 * camera and the keystore.
 */
const theCamera = /scan a label/i;

const openAccount = async (): Promise<void> => {
  await screen.findByText(theCamera);
  await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));
  await screen.findByText("Signed in");
};

/**
 * The group, by the name a screen reader announces for it. Asked by label and
 * not by role: a React Native view is only an accessibility element when it
 * swallows its children, and then the radios inside it would not be.
 */
const appearance = (): ReturnType<typeof within> => within(screen.getByLabelText("Appearance"));

/** The heading of the screen on show: it is drawn in the scheme's ink. */
const headingInk = (): unknown => screen.getByRole("header", { name: "You" });

/**
 * What the status bar was last told, which is what React Native hands the
 * operating system. The component draws nothing, so there is no node to ask;
 * this is the stack it keeps of every mounted bar's props, newest last.
 */
const statusBarStyle = (): string | undefined =>
  (StatusBar as unknown as { _propsStack: { barStyle?: { value: string } }[] })._propsStack.at(-1)
    ?.barStyle?.value;

interface Node {
  readonly props?: Record<string, unknown>;
  readonly children?: readonly unknown[] | null;
}

/** Every drawn node carrying a prop, anywhere in what is on screen. */
const nodesWith = (tree: unknown, prop: string, value: unknown): Node[] => {
  if (tree === null || typeof tree !== "object") {
    return [];
  }

  if (Array.isArray(tree)) {
    return tree.flatMap((child) => nodesWith(child, prop, value));
  }

  const node = tree as Node;
  const here = node.props?.[prop] === value ? [node] : [];

  return [...here, ...(node.children ?? []).flatMap((child) => nodesWith(child, prop, value))];
};

beforeEach(() => {
  theApiKnowsTheHouse();
});

describe("choosing how the app looks", () => {
  it("offers the phone's own scheme, light and dark, and follows the phone until asked", async () => {
    await renderApp({ session: aSession({ username: "dario" }) });
    await openAccount();

    expect(appearance().getByRole("radio", { name: "System" })).toBeSelected();
    expect(appearance().getByRole("radio", { name: "Light" })).not.toBeSelected();
    expect(appearance().getByRole("radio", { name: "Dark" })).not.toBeSelected();
  });

  it.each([
    ["light", LIGHT, "dark-content"],
    ["dark", DARK, "light-content"],
  ] as const)(
    "follows a phone set to %s while System is chosen",
    async (scheme, palette, bar) => {
      await renderApp({
        session: aSession({ username: "dario" }),
        deviceScheme: fakeDeviceScheme(scheme),
      });
      await openAccount();

      expect(headingInk()).toHaveStyle({ color: palette.ink });
      expect(statusBarStyle()).toBe(bar);
    },
  );

  it("follows the phone the moment the phone changes its mind", async () => {
    const device = fakeDeviceScheme("dark");
    await renderApp({ session: aSession({ username: "dario" }), deviceScheme: device });
    await openAccount();

    await act(() => {
      device.set("light");
    });

    expect(headingInk()).toHaveStyle({ color: LIGHT.ink });
  });

  it("paints every screen light the moment Light is picked, on a dark phone", async () => {
    await renderApp({
      session: aSession({ username: "dario" }),
      deviceScheme: fakeDeviceScheme("dark"),
    });
    await openAccount();

    await fireEvent.press(appearance().getByRole("radio", { name: "Light" }));

    expect(appearance().getByRole("radio", { name: "Light" })).toBeSelected();
    expect(headingInk()).toHaveStyle({ color: LIGHT.ink });
    expect(statusBarStyle()).toBe("dark-content");
  });

  it("stays dark when Dark is picked on a light phone", async () => {
    await renderApp({
      session: aSession({ username: "dario" }),
      deviceScheme: fakeDeviceScheme("light"),
    });
    await openAccount();

    await fireEvent.press(appearance().getByRole("radio", { name: "Dark" }));

    expect(headingInk()).toHaveStyle({ color: DARK.ink });
    expect(statusBarStyle()).toBe("light-content");
  });

  /**
   * The point of storing it. `relaunchApp` builds the whole app again against
   * the same keystore, which is what closing the app and opening it is.
   */
  it("is still light after the app is closed and opened, for somebody who chose light", async () => {
    const storage = inMemorySecureStorage({ "waymark.language": "en" });
    const signedIn = { session: aSession({ username: "dario" }), storage };
    await storage.write("waymark.session", JSON.stringify(signedIn.session));
    await renderApp({ ...signedIn, deviceScheme: fakeDeviceScheme("dark") });
    await openAccount();
    await fireEvent.press(appearance().getByRole("radio", { name: "Light" }));

    await relaunchApp({ ...signedIn, deviceScheme: fakeDeviceScheme("dark") });
    await openAccount();

    expect(appearance().getByRole("radio", { name: "Light" })).toBeSelected();
    expect(headingInk()).toHaveStyle({ color: LIGHT.ink });
  });

  it("speaks the setting in the language chosen", async () => {
    await renderApp({ session: aSession({ username: "dario" }), language: "es" });
    await screen.findByText(/escanear una etiqueta/i);
    await fireEvent.press(
      screen.getByRole("button", { name: "Tú, sesión iniciada como dario" }),
    );

    const group = within(await screen.findByLabelText("Apariencia"));
    expect(group.getByRole("radio", { name: "Sistema" })).toBeSelected();
    expect(group.getByRole("radio", { name: "Claro" })).toBeOnTheScreen();
    expect(group.getByRole("radio", { name: "Oscuro" })).toBeOnTheScreen();
  });

  it("gives each answer a target a thumb can hit", async () => {
    await renderApp({ session: aSession({ username: "dario" }) });
    await openAccount();

    for (const name of ["System", "Light", "Dark"]) {
      expect(appearance().getByRole("radio", { name })).toHaveStyle({ minHeight: 48 });
    }
  });
});

/**
 * # The mark on a light bar is ink (ADR 24)
 *
 * Never lime on white. The logo takes the mark's own token, which is the lime
 * in the dark and the ink in the light.
 */
describe("the logo in the bar", () => {
  it.each([
    ["dark", DARK],
    ["light", LIGHT],
  ] as const)("is drawn in the mark's colour on a %s phone", async (scheme, palette) => {
    await renderApp({
      session: aSession({ username: "dario" }),
      deviceScheme: fakeDeviceScheme(scheme),
    });
    await screen.findByText(theCamera);

    const [logo] = nodesWith(screen.toJSON(), "vbWidth", LOGO.width);

    expect(logo?.props?.["fill"]).toBe(palette.mark);
  });
});

/**
 * # A word is never painted in the lime fill
 *
 * `accent` is a FILL, and in the dark it is the same lime as `accentText`, so
 * a word painted with the wrong one looked right on every screen for as long as
 * there was only the dark. On the light page it is 1.26 — a stain, not a word.
 * The same guard the browser has, over this client's source.
 */
describe("the words on every screen", () => {
  it("are never the lime fill, which cannot be read on the light page", () => {
    const { readdirSync, readFileSync } = jest.requireActual<typeof import("node:fs")>("node:fs");
    const { join } = jest.requireActual<typeof import("node:path")>("node:path");
    const sources = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);

        return entry.isDirectory() ? sources(path) : /\.tsx?$/u.test(path) ? [path] : [];
      });

    const offenders = sources(join(__dirname, ".."))
      .filter((path) => !path.includes(".test."))
      .filter((path) => /\b(color|tintColor|tabBarActiveTintColor): colors\.accent\b/u.test(readFileSync(path, "utf8")));

    expect(offenders).toEqual([]);
  });
});

/**
 * # The lime button has a shape on the light page
 *
 * The fill is 1.26 against the light surface: it looks visible, because the
 * hue is loud, but its silhouette is not. The browser has always drawn it an
 * edge in `accentBorder` there; the phone needs the same now it has the scheme.
 */
describe("the primary button", () => {
  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("is edged in the accent's border on the %s page", async (scheme, palette) => {
    await render(
      <SchemeProvider scheme={scheme}>
        <Button tone="primary" onPress={() => undefined}>
          Add a thing
        </Button>
      </SchemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Add a thing" })).toHaveStyle({
      borderColor: palette.accentBorder,
      backgroundColor: palette.accent,
    });
  });
});
