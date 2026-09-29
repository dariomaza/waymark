import { aSession } from "@waymark/api-client/testing";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { sheet, TOKENS } from "../testing/drawn.js";
import { renderApp, screen, userEvent, within } from "../testing/render-app.js";

/**
 * # The account screen, read as settings rather than as paragraphs
 *
 * The owner, holding the phone one-handed: the language and appearance
 * selectors were ugly and the whole screen was disordered — a lede, a big
 * title, two controls of two different sizes, loose cards, and a full-width
 * word button at the bottom. What he approved is a settings screen: who you
 * are with the way out beside your name, then groups — Preferences, Security,
 * Connected programs — each one card of rows, with its actions as icons in the
 * group's title line.
 *
 * jsdom has no layout, so nothing here can prove alignment or wrapping at a
 * narrow width. What it CAN prove is what the stylesheet gives each element —
 * the stylesheets are put into the document after the app is drawn — and
 * everything a person can do.
 */
const signedIn = (): void => {
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })),
    http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
    http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
  );
};

/** The stylesheets the account screen is drawn with, after the tokens. */
const paint = (...sheets: readonly string[]): void => {
  const style = document.createElement("style");
  style.textContent = [TOKENS, ...sheets.map(sheet)].join("\n");
  document.head.append(style);
};

const openAccount = async (): Promise<void> => {
  renderApp({ route: "/you" });
  await screen.findByRole("heading", { name: /^you$/i });
};

/** The `<label>` a radio is drawn as: the input itself is only the mechanism. */
const drawnAs = (radio: HTMLElement): HTMLElement => radio.closest("label") as HTMLElement;

beforeEach(signedIn);

describe("the two selectors", () => {
  /**
   * The language pill was 31 pixels tall, under the floor every other control
   * in this app keeps, and the appearance row beside it was 48 in a different
   * shape. One control, drawn once, cannot disagree with itself.
   */
  it("are the same control, every answer a target a thumb can hit", async () => {
    await openAccount();
    paint("ui/atoms/segmented.css");

    const answers = [
      ...within(screen.getByRole("group", { name: "Language" })).getAllByRole("radio"),
      ...within(screen.getByRole("group", { name: "Appearance" })).getAllByRole("radio"),
    ];

    expect(answers).toHaveLength(5);
    for (const answer of answers) {
      expect(getComputedStyle(drawnAs(answer)).minHeight).toBe("48px");
      expect(getComputedStyle(drawnAs(answer)).minWidth).toBe("48px");
    }
  });

  it("draws the languages as their two letters and reads them out by name", async () => {
    await openAccount();

    const language = within(screen.getByRole("group", { name: "Language" }));

    expect(language.getByRole("radio", { name: "English" })).toBeChecked();
    expect(language.getByRole("radio", { name: "Español" })).not.toBeChecked();
    expect(language.getByText("EN")).toBeVisible();
    expect(language.getByText("ES")).toBeVisible();
  });

  it("picks a language with one tap on its two letters", async () => {
    await openAccount();

    await userEvent.click(screen.getByText("ES"));

    expect(screen.getByRole("radio", { name: "Español" })).toBeChecked();
    expect(screen.getByRole("group", { name: "Idioma" })).toBeVisible();
  });

  /**
   * Three words in a row were what made the appearance control wider than the
   * language one. The pictures are the answer; the words are what a screen
   * reader says, and they are drawn nowhere.
   */
  it("draws the appearance as pictures, and says each one's name only aloud", async () => {
    await openAccount();
    paint("ui/atoms/segmented.css");

    const appearance = within(screen.getByRole("group", { name: "Appearance" }));

    for (const name of ["System", "Light", "Dark"]) {
      const option = drawnAs(appearance.getByRole("radio", { name }));
      const word = within(option).getByText(name);

      expect(option.querySelector("svg")).not.toBeNull();
      expect(getComputedStyle(word).position).toBe("absolute");
      expect(getComputedStyle(word).width).toBe("1px");
    }
  });

  /**
   * The selectors floated on their own, one under a visible heading and one
   * with its name hidden. Now each is a row: its picture and its name on the
   * left, the control on the right, and the name is what the control is
   * called — written once, read by both the eye and a screen reader.
   */
  it("writes each setting's name beside its control, and calls the control by it", async () => {
    await openAccount();
    paint("ui/molecules/setting-row.css");

    for (const name of ["Language", "Appearance"]) {
      const group = screen.getByRole("group", { name });
      const row = group.closest(".setting-row") as HTMLElement;

      expect(within(row).getByText(name)).toBeVisible();
      expect(row.querySelector(".setting-row__label svg")).not.toBeNull();
      expect(getComputedStyle(row).flexWrap).toBe("wrap");
    }
  });
});
