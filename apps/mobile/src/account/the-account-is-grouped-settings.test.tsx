import { aSession } from "@waymark/api-client/testing";

import { LANGUAGE_KEY } from "../app/language.js";
import { inMemorySecureStorage } from "../auth/secure-storage.js";
import { SESSION_KEY } from "../auth/session-store.js";
import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor, within } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # The account screen, read as settings rather than as paragraphs
 *
 * The owner, holding the phone one-handed: the language and appearance
 * selectors were ugly and the whole screen was disordered. What he approved
 * is a settings screen — who you are with the way out beside your name, then
 * groups, each one card of rows, with its actions as icons in the group's
 * title line. The browser draws the same screen, and says so in its own file
 * of the same name.
 */
const theCamera = /scan a label/i;

const openAccount = async (): Promise<void> => {
  await renderApp({ session: aSession({ username: "dario" }) });
  await screen.findByText(theCamera);
  await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));
  await screen.findByLabelText("Appearance");
};

/** A group by the name a screen reader announces for it. */
const group = (name: string): ReturnType<typeof within> => within(screen.getByLabelText(name));

beforeEach(() => {
  theApiKnowsTheHouse();
});

describe("the two selectors", () => {
  /**
   * The language was two 40-wide cells and the appearance three words, in two
   * different shapes on one screen. One control, drawn once, cannot disagree
   * with itself.
   */
  it("are the same control, every answer a target a thumb can hit", async () => {
    await openAccount();

    const answers = [
      ...group("Language").getAllByRole("radio"),
      ...group("Appearance").getAllByRole("radio"),
    ];

    expect(answers).toHaveLength(5);
    for (const answer of answers) {
      expect(answer).toHaveStyle({ minHeight: 48, minWidth: 48 });
    }
  });

  it("draws the languages as their two letters and reads them out by name", async () => {
    await openAccount();

    expect(group("Language").getByRole("radio", { name: "English" })).toBeSelected();
    expect(group("Language").getByRole("radio", { name: "Español" })).not.toBeSelected();
    expect(group("Language").getByText("EN")).toBeOnTheScreen();
    expect(group("Language").getByText("ES")).toBeOnTheScreen();
  });

  it("picks a language with one tap on its two letters", async () => {
    await openAccount();

    await fireEvent.press(screen.getByText("ES"));

    expect(await screen.findByRole("radio", { name: "Español" })).toBeSelected();
    expect(screen.getByLabelText("Idioma")).toBeOnTheScreen();
  });

  /**
   * Three words in a row were what made the appearance control wider than the
   * language one. The pictures are the answer; the words are what a screen
   * reader says, and they are drawn nowhere.
   */
  it("draws the appearance as pictures, and says each one's name only aloud", async () => {
    await openAccount();

    for (const name of ["System", "Light", "Dark"]) {
      expect(group("Appearance").getByRole("radio", { name })).toBeOnTheScreen();
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("writes each setting's name beside its control", async () => {
    await openAccount();

    expect(screen.getByText("Language")).toBeOnTheScreen();
    expect(screen.getByText("Appearance")).toBeOnTheScreen();
  });
});

/** Two programs, which is what the owner's screen holds. */
const twoPrograms = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/machine-tokens`, () =>
      HttpResponse.json({
        machineTokens: [
          { id: "mt1", name: "claude-desktop", scope: "read", createdAt: "2026-04-01T10:00:00.000Z", expiresAt: null, lastUsedAt: null },
          { id: "mt2", name: "home-assistant", scope: "read-write", createdAt: "2026-04-01T10:00:00.000Z", expiresAt: null, lastUsedAt: null },
        ],
      }),
    ),
  );
};

/** A phone with a sensor and a finger enrolled, so it can keep the session behind it. */
const aPhoneThatCanSeal = () =>
  inMemorySecureStorage(
    { [LANGUAGE_KEY]: "en", [SESSION_KEY]: JSON.stringify(aSession({ username: "dario" })) },
    { canUnlock: true, answersThePrompt: true },
  );

const headers = (): (string | undefined)[] =>
  screen
    .getAllByRole("header")
    .map((header) => (typeof header.props.children === "string" ? header.props.children : undefined));

describe("who is signed in", () => {
  it("says the name on its own line, and that it is signed in under it", async () => {
    await openAccount();

    expect(screen.getByText("dario")).toBeOnTheScreen();
    expect(screen.getByText("Signed in")).toBeOnTheScreen();
  });

  /**
   * The way out was a full-width word button at the bottom of everything. It
   * is an icon now, beside the name it signs out, named in words for a screen
   * reader.
   */
  it("signs out from the icon beside the name, which draws no word", async () => {
    await openAccount();

    expect(screen.queryByText("Sign out")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(async () => {
      expect(await screen.findByLabelText("Username")).toBeOnTheScreen();
    });
  });

  it("no longer opens with a sentence about itself", async () => {
    await openAccount();

    expect(screen.queryByText(/how this app speaks and looks/i)).toBeNull();
  });
});

describe("the groups", () => {
  it("are Preferences and Connected programs on a phone with no fingerprint", async () => {
    await renderApp({
      screen: { name: "Tabs" },
      storage: inMemorySecureStorage(
        { [LANGUAGE_KEY]: "en", [SESSION_KEY]: JSON.stringify(aSession({ username: "dario" })) },
        { canUnlock: false },
      ),
    });
    await screen.findByText(theCamera);
    await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));
    await screen.findByLabelText("Appearance");

    expect(headers()).toEqual(expect.arrayContaining(["Preferences", "Connected programs"]));
    expect(headers()).not.toContain("Security");
  });

  /** Not an empty card under a title: the whole group goes with its one row. */
  it("put the fingerprint switch in a Security group between them", async () => {
    await renderApp({ screen: { name: "Tabs" }, storage: aPhoneThatCanSeal() });
    await screen.findByText(theCamera);
    await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));

    expect(
      await screen.findByRole("switch", { name: "Unlock with a fingerprint" }),
    ).toBeOnTheScreen();
    const names = headers();
    expect(names.indexOf("Security")).toBeGreaterThan(names.indexOf("Preferences"));
    expect(names.indexOf("Security")).toBeLessThan(names.indexOf("Connected programs"));
  });

  /**
   * The switch's two-line sentence was one of the paragraphs that made the
   * screen read as a page. It is behind the group's ⓘ, as on the browser.
   */
  it("fold the fingerprint's explanation behind the Security ⓘ", async () => {
    await renderApp({ screen: { name: "Tabs" }, storage: aPhoneThatCanSeal() });
    await screen.findByText(theCamera);
    await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));
    await screen.findByRole("switch", { name: "Unlock with a fingerprint" });

    expect(screen.queryByText(/behind your phone's fingerprint sensor/i)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "More about Security" }));

    expect(screen.getByText(/behind your phone's fingerprint sensor/i)).toBeOnTheScreen();
  });

  it("fold the programs' two sentences behind their group's ⓘ", async () => {
    await openAccount();

    expect(screen.queryByText(/a key you give to a program/i)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "More about Connected programs" }));

    expect(screen.getByText(/a key you give to a program/i)).toBeOnTheScreen();
    expect(screen.getByText(/it is not a secret/i)).toBeOnTheScreen();
  });

  it("names the groups in the words on screen", async () => {
    await openAccount();

    await fireEvent.press(screen.getByText("ES"));

    expect(await screen.findByText("Preferencias")).toBeOnTheScreen();
    expect(screen.getByText("Programas conectados")).toBeOnTheScreen();
  });
});

describe("the connected programs group", () => {
  it("makes a token from the [+] in its title line, which draws no word", async () => {
    await openAccount();

    expect(screen.queryByText("New token")).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "New token" }));

    expect(screen.getByLabelText("What is it for")).toBeOnTheScreen();
  });

  it("gives the address one row, without a title of its own", async () => {
    await openAccount();

    expect(await screen.findByLabelText("The address of this Waymark")).toBeOnTheScreen();
    expect(screen.queryByText("Where to point it")).toBeNull();
  });

  it("gives each token its name, what it may do, and two icons with no words", async () => {
    twoPrograms();
    await openAccount();

    expect(await screen.findByText("home-assistant")).toBeOnTheScreen();
    expect(screen.getByText("Read and write")).toBeOnTheScreen();
    expect(screen.getAllByRole("button", { name: "Rotate" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
    expect(screen.queryByText("Rotate")).toBeNull();
    expect(screen.queryByText("Revoke")).toBeNull();
    expect(screen.queryByText(/^Made /)).toBeNull();
  });
});

