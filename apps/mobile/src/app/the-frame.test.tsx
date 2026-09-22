import { aSession } from "@ariadna/api-client/testing";

import { renderApp, screen } from "../testing/render-app.js";
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
});
