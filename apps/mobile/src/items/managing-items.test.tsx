import { anItem, aSession } from "@ariadna/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { box, drill, garage, theApiKnowsTheHouse, wardrobe } from "../testing/the-house.js";

const atTheDrill = { name: "Item", params: { id: "drill" } } as const;

const theApiKnowsTheDrill = (): void => {
  apiServer.use(
    http.get(`${API_URL}/items/drill`, () =>
      HttpResponse.json({ item: drill, storageUnit: box, path: [garage, wardrobe, box] }),
    ),
  );
};

describe("looking after items", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
    theApiKnowsTheDrill();
  });

  it("shows an item and where it is", async () => {
    await renderApp({ session: aSession(), screen: atTheDrill });

    expect(await screen.findByRole("header", { name: "Cordless drill" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Open Box 3" })).toBeOnTheScreen();
  });

  /**
   * Tags go in whole. A revision that could only add would leave no way to
   * remove the one that was a typo — and a tag is the entire reason searching
   * `cables` finds an item called `HDMI 2.1` (ADR 11).
   */
  it("retags an item with the complete list", async () => {
    const edits: unknown[] = [];
    apiServer.use(
      http.patch(`${API_URL}/items/drill`, async ({ request }) => {
        edits.push(await request.json());

        return HttpResponse.json({ item: anItem({ id: "drill", tags: ["tools"] }) });
      }),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await fireEvent.changeText(screen.getByLabelText("Tags"), "tools, garage");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(edits).toEqual([
        {
          name: "Cordless drill",
          description: null,
          quantity: 1,
          tags: ["tools", "garage"],
        },
      ]);
    });
  });

  /**
   * `InvalidQuantity` is the domain's to raise and comes back as a 422 (ADR
   * 8). This app does not re-check "at least one": a second copy of that rule
   * is how the two come to disagree.
   */
  it("lets the API refuse a quantity rather than checking it here", async () => {
    apiServer.use(
      http.patch(`${API_URL}/items/drill`, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_QUANTITY",
              message: "quantity must be an integer of at least 1, got 0",
              details: { quantity: 0 },
            },
          },
          { status: 422 },
        ),
      ),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    await fireEvent.press(await screen.findByRole("button", { name: "Edit" }));
    await fireEvent.changeText(screen.getByLabelText("Quantity"), "0");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/at least 1, got 0/i)).toBeOnTheScreen();
  });

  /**
   * A move is all or nothing (ADR 3). When it is refused, the person has to
   * be told that NOTHING changed — otherwise the safe behaviour reads as a
   * partial one.
   */
  it("says nothing was moved when the batch was refused", async () => {
    apiServer.use(
      http.post(`${API_URL}/items/move`, () =>
        HttpResponse.json(
          {
            error: {
              code: "STORAGE_UNIT_NOT_FOUND",
              message: "storage unit garage does not exist",
              details: { storageUnitId: "garage" },
            },
          },
          { status: 422 },
        ),
      ),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    await fireEvent.press(await screen.findByRole("button", { name: "Move" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Garage" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move it" }));

    expect(await screen.findByText(/nothing was moved/i)).toBeOnTheScreen();
  });

  it("moves one item as a batch of one", async () => {
    const moved: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/items/move`, async ({ request }) => {
        moved.push(await request.json());

        return HttpResponse.json({ items: [anItem({ id: "drill", storageUnitId: "garage" })] });
      }),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    await fireEvent.press(await screen.findByRole("button", { name: "Move" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Garage" }));
    await fireEvent.press(screen.getByRole("button", { name: "Move it" }));

    await waitFor(() => {
      expect(moved).toEqual([{ itemIds: ["drill"], targetUnitId: "garage" }]);
    });
  });

  it("deletes an item, and says its photos go with it", async () => {
    const withPhotos = anItem({
      id: "drill",
      storageUnitId: "box3",
      name: "Cordless drill",
      photos: ["p1", "p2"],
    });
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: withPhotos,
          storageUnit: box,
          path: [garage, wardrobe, box],
        }),
      ),
      http.delete(`${API_URL}/items/drill`, () =>
        HttpResponse.json({ releasedPhotoIds: ["p1", "p2"] }),
      ),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText(/also deletes its photos/i),
    ).toBeOnTheScreen();
  });

  /**
   * Every item in one request, every row with the breadcrumb the API already
   * joined (ADR 15). The order is the API's answer, not this client's opinion.
   */
  it("lists everything you own, each row saying where it is", async () => {
    apiServer.use(
      http.get(`${API_URL}/items`, () =>
        HttpResponse.json({
          items: [
            {
              item: drill,
              path: [garage, wardrobe, box],
              location: "Garage > Metal wardrobe > Box 3",
            },
          ],
        }),
      ),
    );

    await renderApp({ session: aSession() });

    await screen.findByText(/scan a label/i);
    // The tab is "Things" now: the word somebody standing in a garage uses.
    await fireEvent.press(screen.getByRole("button", { name: "Things" }));

    // The card's one spare line is the box it is in — the whole breadcrumb
    // does not fit in a third of a phone. It is still what a screen reader
    // hears, because the path IS the answer (ADR 15).
    expect(
      await screen.findByRole("link", {
        name: "Cordless drill, Garage > Metal wardrobe > Box 3",
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Box 3")).toBeOnTheScreen();
  });
});
