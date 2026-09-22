import { anItem, anItemHit, aSession, aUnitHit } from "@ariadna/api-client/testing";
import { SearchMatchField } from "@ariadna/domain";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen } from "../testing/render-app.js";
import { box, garage, theApiKnowsTheHouse, wardrobe } from "../testing/the-house.js";

const openSearch = async (): Promise<void> => {
  await screen.findByText(/scan a label/i);
  await fireEvent.press(screen.getByRole("button", { name: "Search" }));
};

/**
 * The feature the product is named after. Things get stored and then lost —
 * not lost as in gone, lost as in "it is somewhere in one of forty boxes".
 */
describe("searching for where something is", () => {
  it("answers with the thing AND where it is", async () => {
    theApiKnowsTheHouse();
    const asked: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/search`, ({ request }) => {
        asked.push(new URL(request.url).search);

        return HttpResponse.json({
          query: "drill",
          terms: ["drill"],
          items: [
            anItemHit(anItem({ id: "drill", name: "Cordless drill" }), [
              garage,
              wardrobe,
              box,
            ]),
          ],
          storageUnits: [],
        });
      }),
    );

    await renderApp({ session: aSession() });
    await openSearch();

    await fireEvent.changeText(
      await screen.findByLabelText(/search for a thing or a box/i),
      "drill",
    );

    expect(await screen.findByText("Cordless drill")).toBeOnTheScreen();
    // The breadcrumb IS the answer: "you own a cordless drill" is something
    // the person already knew. A card a third of a phone wide holds the last
    // step of it — the box to walk to — and a match on the NAME needs no
    // explaining, so nothing else crowds that line.
    expect(screen.getByText("Box 3")).toBeOnTheScreen();
    // The whole path is still what the card is NAMED, so none of the answer
    // is lost to somebody who cannot see the grid.
    expect(
      screen.getByRole("link", {
        name: "Cordless drill, Garage > Metal wardrobe > Box 3",
      }),
    ).toBeOnTheScreen();
    expect(asked).toEqual(["?q=drill"]);
  });

  /**
   * An item called `HDMI 2.1` answering a search for `cables` looks like a
   * mistake until the row says "matched tag", and then it looks like the
   * feature working.
   */
  it("says WHY a result is there, since the name may not say it", async () => {
    theApiKnowsTheHouse();
    apiServer.use(
      http.get(`${API_URL}/search`, () =>
        HttpResponse.json({
          query: "cables",
          terms: ["cables"],
          items: [
            anItemHit(
              anItem({ id: "hdmi", name: "HDMI 2.1", tags: ["cables"] }),
              [garage, box],
              [SearchMatchField.TAG],
            ),
          ],
          storageUnits: [],
        }),
      ),
    );

    await renderApp({ session: aSession() });
    await openSearch();

    await fireEvent.changeText(
      await screen.findByLabelText(/search for a thing or a box/i),
      "cables",
    );

    expect(await screen.findByText("HDMI 2.1")).toBeOnTheScreen();
    // One line, two things it cannot do without: the box to walk to first
    // because it is the answer, the reason second because without it the
    // result looks like a bug.
    expect(screen.getByText("Box 3 · tag")).toBeOnTheScreen();
    expect(
      screen.getByRole("link", { name: "HDMI 2.1, Garage > Box 3, matched tag" }),
    ).toBeOnTheScreen();
  });

  /**
   * Items and storage units answer two different questions — "where is my
   * drill" and "where is Box 3" — so they are two lists. Interleaving them
   * would need a rule the API refuses to invent, and so does this.
   */
  it("keeps items and storage units apart", async () => {
    theApiKnowsTheHouse();
    apiServer.use(
      http.get(`${API_URL}/search`, () =>
        HttpResponse.json({
          query: "box",
          terms: ["box"],
          items: [anItemHit(anItem({ id: "drill", name: "Cordless drill" }), [garage, box])],
          storageUnits: [aUnitHit(box, [garage, wardrobe, box])],
        }),
      ),
    );

    await renderApp({ session: aSession() });
    await openSearch();

    await fireEvent.changeText(
      await screen.findByLabelText(/search for a thing or a box/i),
      "box",
    );

    expect(await screen.findByLabelText("Items found")).toBeOnTheScreen();
    expect(screen.getByLabelText("Storage units found")).toBeOnTheScreen();
  });

  it("asks for nothing at all until something has been typed", async () => {
    theApiKnowsTheHouse();
    // No handler for /search: a request would fail the test, which is the
    // point. A search screen nobody has typed into costs zero requests.

    await renderApp({ session: aSession() });
    await openSearch();

    expect(await screen.findByText(/type what you are looking for/i)).toBeOnTheScreen();
  });

  it("says nothing matched, rather than showing an empty screen", async () => {
    theApiKnowsTheHouse();
    apiServer.use(
      http.get(`${API_URL}/search`, () =>
        HttpResponse.json({
          query: "zzzz",
          terms: ["zzzz"],
          items: [],
          storageUnits: [],
        }),
      ),
    );

    await renderApp({ session: aSession() });
    await openSearch();

    await fireEvent.changeText(
      await screen.findByLabelText(/search for a thing or a box/i),
      "zzzz",
    );

    expect(await screen.findByText(/nothing matches/i)).toBeOnTheScreen();
  });
});
