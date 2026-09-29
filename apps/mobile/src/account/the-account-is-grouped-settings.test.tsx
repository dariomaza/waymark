import { aSession } from "@waymark/api-client/testing";

import { fireEvent, renderApp, screen, within } from "../testing/render-app.js";
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
