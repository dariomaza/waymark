import { anItem, aPhoto, aSession, type ItemOverrides } from "@waymark/api-client/testing";
import { PhotoProcessingStatus } from "@waymark/domain";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fakePhotoSource } from "../testing/fake-photo-source.js";
import { fireEvent, renderApp, screen, waitFor, within } from "../testing/render-app.js";
import { box, garage, theApiKnowsTheHouse } from "../testing/the-house.js";

const atTheDrill = { name: "Item", params: { id: "drill" } } as const;

const theDrillHolds = (photos: NonNullable<ItemOverrides["photos"]>): void => {
  apiServer.use(
    http.get(`${API_URL}/items/drill`, () =>
      HttpResponse.json({
        item: anItem({ id: "drill", storageUnitId: "box3", name: "Cordless drill", photos }),
        storageUnit: box,
        path: [garage, box],
      }),
    ),
  );
};

describe("photographing a thing", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  /**
   * # A photo is shown the moment it is stored
   *
   * Background removal is optional, runs out of process and may never happen
   * at all (ADR 4). `PENDING` is the normal state of a freshly uploaded photo
   * and may be its final one, so the original is drawn immediately and the
   * screen says, quietly, what is still outstanding.
   */
  it("draws the original of a photo still waiting for its background removal", async () => {
    theDrillHolds([aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.PENDING })]);

    await renderApp({ session: aSession(), screen: atTheDrill });

    const gallery = await screen.findByLabelText("Photos");
    const image = within(gallery).getByLabelText("Cover photo of Cordless drill");

    // The URL the API handed out, and nothing this app built out of an id.
    // While PENDING that route serves the original, and the app neither knows
    // nor needs to know which file is behind it.
    expect(image).toHaveProp("source", expect.objectContaining({
      uri: `${API_URL}/photos/p1/thumbnail`,
    }));
    expect(
      screen.getByText(/background removal is still pending/i),
    ).toBeOnTheScreen();
  });

  it("says WHICH photo is still waiting, and stays quiet about the rest", async () => {
    theDrillHolds([
      aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.DONE }),
      aPhoto({ id: "p2", processingStatus: PhotoProcessingStatus.PENDING }),
    ]);

    await renderApp({ session: aSession(), screen: atTheDrill });

    await screen.findByLabelText("Photos");
    // A finished photo is just a photo, and a note on every cell is noise.
    expect(screen.getAllByText(/background removal is still pending/i)).toHaveLength(1);
  });

  it("carries the session on the image itself, because photos need one", async () => {
    theDrillHolds([aPhoto({ id: "p1" })]);

    await renderApp({ session: aSession({ token: "a-live-token" }), screen: atTheDrill });

    const gallery = await screen.findByLabelText("Photos");
    const image = within(gallery).getByLabelText("Cover photo of Cordless drill");

    expect(image).toHaveProp("source", expect.objectContaining({
      headers: { Authorization: "Bearer a-live-token" },
    }));
  });

  /**
   * What the asset turns into inside the multipart body is React Native's to
   * decide and is pinned in `api/mobile-client.test.ts`; a test runner's
   * `FormData` is the platform one and cannot reproduce it. What belongs here
   * is the flow: the button opens the camera, whatever it hands back is
   * posted to the route that addresses the item, and the gallery follows.
   */
  it("takes a photo with the camera and posts it to the item that will hold it", async () => {
    theDrillHolds([]);
    const posted: string[] = [];
    apiServer.use(
      http.post(`${API_URL}/items/drill/photos`, ({ request }) => {
        posted.push(`${request.method} ${new URL(request.url).pathname}`);
        theDrillHolds([aPhoto({ id: "p1" })]);

        return HttpResponse.json(
          {
            photo: aPhoto({ id: "p1" }),
            item: anItem({ id: "drill", photos: ["p1"] }),
          },
          { status: 201 },
        );
      }),
    );

    const camera = fakePhotoSource();
    camera.hands({ uri: "file:///tmp/drill.jpg", name: "drill.jpg", type: "image/jpeg" });

    await renderApp({ session: aSession(), screen: atTheDrill, photos: camera });

    await fireEvent.press(await screen.findByRole("button", { name: "Take a photo" }));

    await waitFor(() => {
      expect(posted).toEqual(["POST /items/drill/photos"]);
    });

    // And the picture is on the screen, from its original, straight away.
    expect(
      await screen.findByLabelText("Cover photo of Cordless drill"),
    ).toBeOnTheScreen();
  });

  /**
   * Saying no to the camera is a normal answer on a phone, not a crash.
   */
  it("says so when the camera permission was refused", async () => {
    theDrillHolds([]);
    const camera = fakePhotoSource();
    camera.refuses("Waymark needs permission to use the camera before it can take a photo.");

    await renderApp({ session: aSession(), screen: atTheDrill, photos: camera });

    await fireEvent.press(await screen.findByRole("button", { name: "Take a photo" }));

    expect(await screen.findByText(/needs permission to use the camera/i)).toBeOnTheScreen();
  });

  /**
   * The cover is `photos[0]` and there is no field to set (ADR 9), so making
   * one the cover is spelled as what it is: a reorder of the complete list.
   */
  it("makes a photo the cover by reordering the whole list", async () => {
    theDrillHolds([aPhoto({ id: "p1" }), aPhoto({ id: "p2" })]);
    const ordered: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/items/drill/photos/order`, async ({ request }) => {
        ordered.push(await request.json());

        return HttpResponse.json({ item: anItem({ id: "drill", photos: ["p2", "p1"] }) });
      }),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    await fireEvent.press(
      await screen.findByRole("button", { name: "Make photo 2 the cover" }),
    );

    await waitFor(() => {
      expect(ordered).toEqual([{ photoIds: ["p2", "p1"] }]);
    });
  });

  /**
   * `TOO_MANY_ITEM_PHOTOS` is a 409: the item is full RIGHT NOW, and deleting
   * one makes the identical upload succeed (ADR 8).
   */
  it("reads out a refusal to hold an eleventh photo", async () => {
    theDrillHolds([]);
    apiServer.use(
      http.post(`${API_URL}/items/drill/photos`, () =>
        HttpResponse.json(
          {
            error: {
              code: "TOO_MANY_ITEM_PHOTOS",
              message: "item drill already holds 10 photos",
              details: { itemId: "drill", limit: 10, photoCount: 10 },
            },
          },
          { status: 409 },
        ),
      ),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    await fireEvent.press(await screen.findByRole("button", { name: "Choose a photo" }));

    expect(
      await screen.findByText(/already holds 10 photos\. delete one to make room/i),
    ).toBeOnTheScreen();
  });

  /**
   * ADR 4 left it open — "`FAILED` photos need a retry path, otherwise they
   * stay unprocessed forever" — and ADR 10 built the route. A failed photo
   * looks the same on a phone as in a browser, so the button is on both.
   */
  it("asks for a failed background removal again, from the photo it happened to", async () => {
    const asked: string[] = [];
    theDrillHolds([aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.FAILED })]);
    apiServer.use(
      http.post(`${API_URL}/photos/p1/reprocess`, ({ request }) => {
        asked.push(new URL(request.url).pathname);

        return HttpResponse.json(
          { photo: aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.PENDING }) },
          { status: 202 },
        );
      }),
    );

    await renderApp({ session: aSession(), screen: atTheDrill });

    expect(await screen.findByText(/background removal failed/i)).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Try removing the background again" }),
    );

    await waitFor(() => {
      expect(asked).toEqual(["/photos/p1/reprocess"]);
    });
  });

  it("offers nothing to press on a photo that is merely still pending", async () => {
    theDrillHolds([aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.PENDING })]);

    await renderApp({ session: aSession(), screen: atTheDrill });

    expect(await screen.findByText(/still pending/i)).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Try removing the background again" }),
    ).toBeNull();
  });
});
