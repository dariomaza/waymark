import { anItem, anItemHit, aSession, aUnitHit } from "@waymark/api-client/testing";
import { SearchMatchField } from "@waymark/domain";

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

/**
 * # The scope is where you are, not where you were the first time
 *
 * Search is a TAB, so once it has been opened the screen stays mounted for the
 * life of the app. It held the unit to search inside in `useState`, seeded from
 * `route.params` — and a `useState` initialiser runs once, at mount. So the
 * second "Search inside", from a different box, silently searched the FIRST
 * box; and once "Search everywhere" had been pressed, every scoped search after
 * it was unscoped, for as long as the app stayed open.
 *
 * The web client never had this, because its scope lives in the URL and is read
 * on every render. The navigation parameter is that URL here, so it is read the
 * same way and the button that widens the search clears it.
 *
 * This is the feature the owner asked for — "dentro de un espacio, quiero que
 * las acciones principales sean buscar y añadir un objeto" — and it worked
 * exactly once per launch.
 *
 * ## Why these tests walk in through the inventory
 *
 * Because that is the only route that keeps the tabs mounted, and a mounted
 * tab is the whole bug. Opening a unit from the inventory pushes it ON TOP of
 * the tabs and "Search inside" pops back down to them, so the search screen is
 * the same instance both times. A test that started on a unit screen instead
 * would push the tabs above it, throw them away on the way back, and get a
 * brand new search screen for free — which passes, and proves nothing.
 */
describe("searching inside one box rather than the whole house", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  const searchInside = async (): Promise<void> => {
    await fireEvent.press(await screen.findByRole("button", { name: "Search inside" }));
  };

  /** In through the inventory, which leaves the tabs where they are. */
  const open = async (unit: string): Promise<void> => {
    await fireEvent.press(screen.getByRole("button", { name: "Places" }));
    await fireEvent.press(await screen.findByRole("link", { name: new RegExp(`^${unit},`, "u") }));
    await screen.findByRole("header", { name: unit });
  };

  const start = async (): Promise<void> => {
    await renderApp({ session: aSession() });
    await screen.findByText(/scan a label/i);
  };

  it("narrows to the box asked for this time, not the one asked for first", async () => {
    await start();

    await open("Garage");
    await searchInside();
    expect(
      await screen.findByText("Searching inside Garage, and everything under it."),
    ).toBeOnTheScreen();

    await open("Metal wardrobe");
    await searchInside();

    expect(
      await screen.findByText("Searching inside Metal wardrobe, and everything under it."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Searching inside Garage, and everything under it.")).toBeNull();
  });

  it("narrows again after somebody has asked to search the whole house", async () => {
    await start();

    await open("Garage");
    await searchInside();
    await fireEvent.press(await screen.findByRole("button", { name: "Search everywhere" }));
    expect(screen.queryByText(/searching inside/i)).toBeNull();

    await open("Garage");
    await searchInside();

    expect(
      await screen.findByText("Searching inside Garage, and everything under it."),
    ).toBeOnTheScreen();
  });

  /** And the narrowing reaches the API, which is the only place it does anything. */
  it("asks the API for the subtree it is showing, and no other", async () => {
    const asked: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/search`, ({ request }) => {
        asked.push(new URL(request.url).search);

        return HttpResponse.json({ query: "drill", terms: ["drill"], items: [], storageUnits: [] });
      }),
    );

    await start();

    await open("Garage");
    await searchInside();
    await open("Metal wardrobe");
    await searchInside();

    await fireEvent.changeText(
      await screen.findByLabelText(/search for a thing or a box/i),
      "drill",
    );

    await screen.findByText(/nothing matches/i);
    expect(asked).toEqual(["?q=drill&within=wardrobe"]);
  });
});
