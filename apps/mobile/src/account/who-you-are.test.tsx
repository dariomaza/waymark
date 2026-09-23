import { aSession } from "@waymark/api-client/testing";

import { fireEvent, renderApp, screen, waitFor, within } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # The one thing in the bar that is not part of the inventory
 *
 * Four destinations are places to look for a thing. The fifth is you: who is
 * signed in, what language the app speaks, and the way out. Those do not
 * belong beside Places and Things as a word, so they are behind the one shape
 * every product has taught people means "this is about me" — a round thing
 * with your initial in it.
 *
 * It replaces a line of chrome. "Signed in as dario" used to sit across the
 * top of the screen somebody looks at most, saying something they already
 * knew, on every screen, for ever. The avatar says the same thing in the space
 * of a tab and only when looked at.
 */
const theCamera = /scan a label/i;

describe("who you are", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  describe("the avatar in the bottom bar", () => {
    /**
     * The initials come from `initialsOf` in `@waymark/api-client`, which is
     * the same function the item cards use for a thing with no photo. A second
     * one would be a second set of rules about punctuation, emoji and
     * uppercasing that agree until the day they do not — so the test uses a
     * two-word name, which is the case a `name[0]` would get wrong and this
     * one gets right.
     */
    it("draws the initials of whoever is signed in", async () => {
      await renderApp({ session: aSession({ username: "dario maza" }) });

      await screen.findByText(theCamera);

      /**
       * `includeHiddenElements`, because the initials are DRAWN and not
       * announced. Inside the tab they are decorative — the button around them
       * already says who is signed in, in words — exactly as the other four
       * tabs' icons are. A screen reader that read "DM" here would be reading
       * the abbreviation instead of the answer.
       */
      const tab = screen.getByRole("button", { name: "You, signed in as dario maza" });

      expect(
        within(tab).getAllByText("DM", { includeHiddenElements: true }).length,
      ).toBeGreaterThan(0);
    });

    /**
     * "DM" read aloud is two letters. The tab is named with the whole answer,
     * because a screen reader landing here should learn who is signed in
     * rather than be read the abbreviation and left to work it out.
     */
    it("is named for a screen reader with who it is, not with two letters", async () => {
      await renderApp({ session: aSession({ username: "dario" }) });

      await screen.findByText(theCamera);

      expect(
        screen.getByRole("button", { name: "You, signed in as dario" }),
      ).toBeOnTheScreen();
    });
  });

  describe("what opens when it is tapped", () => {
    it("says who is signed in", async () => {
      await renderApp({ session: aSession({ username: "dario" }) });

      await screen.findByText(theCamera);
      await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));

      expect(await screen.findByText("Signed in as dario")).toBeOnTheScreen();
    });

    /**
     * The language moved here from the top bar. It is a setting that belongs
     * to a person rather than to an inventory, and the bar it was in is drawn
     * on every screen — so it was two permanently visible buttons, on every
     * screen, for a choice made roughly once.
     */
    it("carries the language, and changing it changes every word", async () => {
      await renderApp({ session: aSession({ username: "dario" }) });

      await screen.findByText(theCamera);
      await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));

      await fireEvent.press(await screen.findByRole("radio", { name: "Español" }));

      expect(await screen.findByRole("button", { name: "Lugares" })).toBeOnTheScreen();
    });

    it("is the way out", async () => {
      await renderApp({ session: aSession({ username: "dario" }) });

      await screen.findByText(theCamera);
      await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));

      await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));

      await waitFor(async () => {
        expect(await screen.findByLabelText("Username")).toBeOnTheScreen();
      });
    });
  });

  /**
   * # The line that went away
   *
   * A line of chrome on the screen you look at most is rent. The avatar says
   * it now, in the space it was already taking, and only to somebody who
   * looked.
   */
  describe("the main screen", () => {
    it("does not spell out who is signed in", async () => {
      await renderApp({ session: aSession({ username: "dario" }) });

      await screen.findByText(theCamera);

      expect(screen.queryByText(/signed in as/i)).toBeNull();
    });

    it("keeps the top bar down to the product's name", async () => {
      await renderApp({ session: aSession({ username: "dario" }) });

      await screen.findByText(theCamera);

      expect(screen.getByRole("header", { name: "Waymark" })).toBeOnTheScreen();
      expect(screen.queryByRole("radio", { name: "Español" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    });
  });

  describe("in Spanish", () => {
    it("names the avatar and the surface it opens in the language on screen", async () => {
      await renderApp({ session: aSession({ username: "dario" }), language: "es" });

      await screen.findByText(/escanear una etiqueta/i);

      const avatar = screen.getByRole("button", { name: "Tú, sesión iniciada como dario" });
      await fireEvent.press(avatar);

      expect(await screen.findByText("Sesión iniciada como dario")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeOnTheScreen();
    });
  });
});
