import { aSession } from "@waymark/api-client/testing";

import { fireEvent, renderApp, screen } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * The frame every signed-in screen sits in: the bar at the top, and the four
 * destinations at the bottom where the thumb already is.
 */
describe("the frame every signed-in screen sits in", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  describe("the navigation", () => {
    /**
     * The four destinations are icons now, with the word kept under each. The
     * word is what makes an icon legible the FIRST time: a magnifier means
     * search everywhere in the world, but no shape in any vocabulary means
     * "places" or "things", so those two would otherwise have to be learned
     * by tapping them and finding out.
     *
     * Which is also why the accessible name is the WORD rather than a
     * description of the drawing. A screen reader that announces "cube icon"
     * has described the shape and withheld the destination.
     */
    it("names every destination in a word, not in a picture", async () => {
      await renderApp({ session: aSession() });

      await screen.findByText(/scan a label/i);

      for (const word of ["Places", "Things", "Search", "Scan"]) {
        expect(screen.getByRole("button", { name: word })).toBeOnTheScreen();
        // And the word is on screen, under the drawing, not only announced.
        expect(screen.getByText(word)).toBeOnTheScreen();
      }
    });

    /**
     * "Places" and "Things", not "Inventory" and "Items".
     *
     * The two words a person uses standing in a garage are where and what.
     * "Inventory" is the name of the database; the tab is for the person, so
     * it takes the person's word.
     */
    it("uses the words somebody standing in a garage uses", async () => {
      await renderApp({ session: aSession() });

      await screen.findByText(/scan a label/i);

      expect(screen.queryByText("Inventory")).toBeNull();
      expect(screen.queryByText("Items")).toBeNull();
    });
  });

  describe("the top bar", () => {
    it("carries the product's name wherever you are", async () => {
      await renderApp({ session: aSession() });

      expect(await screen.findByRole("header", { name: "Waymark" })).toBeOnTheScreen();
    });

    /**
     * And nothing else. The language used to sit here as two permanently
     * visible buttons on every screen, for a choice made roughly once; it now
     * lives behind the avatar with the rest of what belongs to a person rather
     * than to an inventory. See `account/who-you-are.test.tsx`.
     */
    it("carries nothing that belongs to a person rather than to the inventory", async () => {
      await renderApp({ session: aSession() });

      await screen.findByRole("header", { name: "Waymark" });

      expect(screen.queryByRole("radio", { name: "Español" })).toBeNull();
    });

    /**
     * The code is what fits in a control; the language's own name is what
     * makes it a label somebody can act on, because "ES" read aloud is two
     * letters.
     */
    it("offers a language on the account screen, and reflects the one chosen", async () => {
      await renderApp({ session: aSession() });

      await openTheAccountScreen();

      const spanish = await screen.findByRole("radio", { name: "Español" });
      const english = screen.getByRole("radio", { name: "English" });
      expect(english).toBeSelected();

      await fireEvent.press(spanish);

      expect(spanish).toBeSelected();
      expect(english).not.toBeSelected();
    });
  });
});

/**
 * The language control moved behind the avatar, so every test about it now
 * goes the way a thumb does: tap the circle with your initial in it.
 */
const openTheAccountScreen = async (username = "dario"): Promise<void> => {
  await fireEvent.press(
    await screen.findByRole("button", { name: new RegExp(`signed in as ${username}|como ${username}`, "i") }),
  );
};

/**
 * # The switcher means something now
 *
 * It has been storing a choice in the keystore since the day it shipped and
 * translating nothing. These are the tests that say the choice reaches the
 * screen — and, because this store is asynchronous, that it reaches the FIRST
 * screen rather than the second.
 */
describe("the language the interface is in", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  it("changes every word on screen the moment the choice changes", async () => {
    await renderApp({ session: aSession() });

    await openTheAccountScreen();
    await fireEvent.press(await screen.findByRole("radio", { name: "Español" }));

    expect(screen.getByRole("button", { name: "Lugares" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cosas" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Escanear" })).toBeOnTheScreen();
  });

  /**
   * The point of putting the preference in the keystore in the first place.
   *
   * `renderApp` builds the whole app against a keystore that already holds
   * the choice, which is exactly what reopening a killed app looks like. The
   * assertion that matters is the ABSENCE of an English frame first: the
   * store is asynchronous, so the naive wiring renders English and corrects
   * itself, and somebody who chose Spanish would see that flash every single
   * cold start.
   */
  it("opens in Spanish for somebody who chose Spanish before the app was killed", async () => {
    await renderApp({ session: aSession(), language: "es" });

    expect(await screen.findByRole("button", { name: "Lugares" })).toBeOnTheScreen();
    expect(screen.queryByText("Places")).toBeNull();
    expect(screen.queryByText("Things")).toBeNull();
  });

  it("reflects the stored choice in the switcher itself", async () => {
    await renderApp({ session: aSession(), language: "es" });

    await openTheAccountScreen();

    expect(await screen.findByRole("radio", { name: "Español" })).toBeSelected();
    expect(screen.getByRole("radio", { name: "English" })).not.toBeSelected();
  });

  /** The product is called Waymark in both languages. A name is not a word to be translated. */
  it("leaves the product's own name alone", async () => {
    await renderApp({ session: aSession(), language: "es" });

    expect(await screen.findByRole("header", { name: "Waymark" })).toBeOnTheScreen();
  });

  /** The group a screen reader announces before the two options inside it. */
  it("names the language control itself in the chosen language", async () => {
    await renderApp({ session: aSession(), language: "es" });

    await openTheAccountScreen();

    expect(await screen.findByLabelText("Idioma")).toBeOnTheScreen();
  });
});
