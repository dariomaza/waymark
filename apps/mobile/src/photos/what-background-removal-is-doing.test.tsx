import { anItem, aPhoto, aSession } from "@waymark/api-client/testing";
import { PhotoProcessingStatus } from "@waymark/domain";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { box, garage, theApiKnowsTheHouse, wardrobe } from "../testing/the-house.js";

/**
 * # The screen for whoever runs the sidecar
 *
 * `GET /photos/processing` was built so that "is it on" and "how many are
 * stuck" do not need SSH and a SQL client (ADR 10), and the two retry routes
 * were built so a `FAILED` photo is not failed for ever (ADR 4). On a phone
 * none of the three had a button anywhere — and a phone is the machine most
 * likely to be in the hand of somebody who has just watched a background
 * removal fail on a photo they took thirty seconds ago.
 *
 * It is deliberately NOT a tab. Background removal is a secondary feature
 * that must never take space from the primary one, and a fifth destination
 * for it would be this app disagreeing with ADR 4 in the place people look
 * most. It is reached from where somebody has just met the problem: the note
 * under a photo whose removal failed.
 */
const someProcessing = (overrides: Record<string, unknown> = {}): unknown => ({
  processor: { enabled: true, url: "http://127.0.0.1:8000", reachable: true },
  counts: { PENDING: 2, DONE: 40, FAILED: 0, SKIPPED: 1 },
  abandoned: [],
  ...overrides,
});

const theApiSays = (processing: unknown): void => {
  apiServer.use(
    http.get(`${API_URL}/photos/processing`, () => HttpResponse.json(processing)),
  );
};

const anAbandonedPhoto = (overrides: Record<string, unknown> = {}): unknown => ({
  photoId: "p1",
  attempts: 3,
  lastError: "sidecar returned 500",
  lastAttemptAt: "2026-05-02T09:00:00.000Z",
  url: "/photos/p1",
  ...overrides,
});

const atTheQueue = { name: "Processing" } as const;

describe("what background removal is doing", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  describe("the sidecar itself", () => {
    it("says it is on when it is on and answering", async () => {
      theApiSays(someProcessing());

      await renderApp({ session: aSession(), screen: atTheQueue });

      expect(await screen.findByText(/on and answering/i)).toBeOnTheScreen();
    });

    /**
     * Switched off is not a fault. With no sidecar configured there is no
     * processor, no worker and no timer, every photo sits at `PENDING` for
     * ever, and that is a complete installation (ADR 4). Saying "unreachable"
     * there would report a problem nobody has.
     */
    it("says it is switched off rather than broken when there is none", async () => {
      theApiSays(
        someProcessing({ processor: { enabled: false, url: null, reachable: null } }),
      );

      await renderApp({ session: aSession(), screen: atTheQueue });

      expect(await screen.findByText(/switched off/i)).toBeOnTheScreen();
    });

    it("says it is configured but not answering, and where it was looking", async () => {
      theApiSays(
        someProcessing({
          processor: { enabled: true, url: "http://sidecar:8000", reachable: false },
        }),
      );

      await renderApp({ session: aSession(), screen: atTheQueue });

      expect(await screen.findByText(/not answering/i)).toBeOnTheScreen();
      expect(screen.getByText("http://sidecar:8000")).toBeOnTheScreen();
    });
  });

  describe("the queue", () => {
    it("counts the photos in every state, in words rather than the API's", async () => {
      theApiSays(someProcessing());

      await renderApp({ session: aSession(), screen: atTheQueue });

      expect(await screen.findByText("Waiting")).toBeOnTheScreen();
      expect(screen.getByText("Background removed")).toBeOnTheScreen();
      expect(screen.getByText("Nothing to remove")).toBeOnTheScreen();
      expect(screen.getByText("40")).toBeOnTheScreen();
    });

    it("says nothing has failed rather than drawing an empty list", async () => {
      theApiSays(someProcessing());

      await renderApp({ session: aSession(), screen: atTheQueue });

      expect(await screen.findByText(/nothing has failed/i)).toBeOnTheScreen();
    });

    it("names each abandoned photo, why it was given up on, and what it cost", async () => {
      theApiSays(
        someProcessing({
          counts: { PENDING: 0, DONE: 1, FAILED: 1, SKIPPED: 0 },
          abandoned: [anAbandonedPhoto()],
        }),
      );

      await renderApp({ session: aSession(), screen: atTheQueue });

      expect(await screen.findByText("p1")).toBeOnTheScreen();
      expect(screen.getByText("sidecar returned 500")).toBeOnTheScreen();
      expect(screen.getByText(/3 attempts/)).toBeOnTheScreen();
    });

    /**
     * The list is a bounded SAMPLE and the count is the truth. Somebody
     * reading three rows under a number that says nine has to be told which
     * of the two to believe.
     */
    it("says the list is only a sample when it is", async () => {
      theApiSays(
        someProcessing({
          counts: { PENDING: 0, DONE: 1, FAILED: 9, SKIPPED: 0 },
          abandoned: [
            anAbandonedPhoto({ photoId: "p1" }),
            anAbandonedPhoto({ photoId: "p2" }),
          ],
        }),
      );

      await renderApp({ session: aSession(), screen: atTheQueue });

      expect(await screen.findByText(/9 photos were given up on/i)).toBeOnTheScreen();
      expect(screen.getByText(/showing 2 of them/i)).toBeOnTheScreen();
    });
  });

  describe("putting photos back in the queue", () => {
    it("retries every failed photo, and says how many went back", async () => {
      theApiSays(
        someProcessing({
          counts: { PENDING: 0, DONE: 1, FAILED: 4, SKIPPED: 0 },
          abandoned: [],
        }),
      );
      let asked = 0;
      apiServer.use(
        http.post(`${API_URL}/photos/processing/retry`, () => {
          asked += 1;

          return HttpResponse.json({ requeued: 4 }, { status: 202 });
        }),
      );

      await renderApp({ session: aSession(), screen: atTheQueue });

      await fireEvent.press(
        await screen.findByRole("button", { name: "Retry every failed photo" }),
      );

      /*
       * The answer is a 202: the photos are queued, and how long that takes
       * is the sidecar's business. Saying "back in the queue" rather than
       * "done" is the whole of ADR 4 in one sentence.
       */
      expect(await screen.findByText(/4 photos are back in the queue/i)).toBeOnTheScreen();
      expect(asked).toBe(1);
    });

    it("retries one photo on its own", async () => {
      theApiSays(
        someProcessing({
          counts: { PENDING: 0, DONE: 1, FAILED: 1, SKIPPED: 0 },
          abandoned: [anAbandonedPhoto({ photoId: "p1" })],
        }),
      );
      const asked: string[] = [];
      apiServer.use(
        http.post(`${API_URL}/photos/p1/reprocess`, ({ request }) => {
          asked.push(new URL(request.url).pathname);

          return HttpResponse.json({ photo: aPhoto({ id: "p1" }) }, { status: 202 });
        }),
      );

      await renderApp({ session: aSession(), screen: atTheQueue });

      await fireEvent.press(await screen.findByRole("button", { name: "Try p1 again" }));

      await waitFor(() => {
        expect(asked).toEqual(["/photos/p1/reprocess"]);
      });
    });

    it("says so when the API refuses a retry, rather than looking like it worked", async () => {
      theApiSays(
        someProcessing({ counts: { PENDING: 0, DONE: 1, FAILED: 4, SKIPPED: 0 } }),
      );
      apiServer.use(
        http.post(`${API_URL}/photos/processing/retry`, () =>
          HttpResponse.json(
            { error: { code: "INTERNAL", message: "no", details: {} } },
            { status: 500 },
          ),
        ),
      );

      await renderApp({ session: aSession(), screen: atTheQueue });

      await fireEvent.press(
        await screen.findByRole("button", { name: "Retry every failed photo" }),
      );

      expect(await screen.findByText(/problem answering/i)).toBeOnTheScreen();
    });
  });

  /**
   * # How anybody gets here
   *
   * From the question a failure immediately raises — "is it just this one?" —
   * which is the screen the two `/photos/processing` routes were built for.
   */
  describe("getting to it", () => {
    it("is one tap from a photo whose background removal failed", async () => {
      const failed = aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.FAILED });
      const drill = anItem({
        id: "drill",
        storageUnitId: "box3",
        name: "Cordless drill",
        photos: [failed],
      });
      theApiSays(someProcessing());
      apiServer.use(
        http.get(`${API_URL}/items/drill`, () =>
          HttpResponse.json({ item: drill, storageUnit: box, path: [garage, wardrobe, box] }),
        ),
        http.get(`${API_URL}/photos/p1/thumbnail`, () =>
          HttpResponse.arrayBuffer(new ArrayBuffer(8), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      );

      await renderApp({
        session: aSession(),
        screen: { name: "Item", params: { id: "drill" } },
      });

      await fireEvent.press(
        await screen.findByRole("link", { name: "See every photo that failed" }),
      );

      expect(
        await screen.findByRole("header", { name: "Background removal" }),
      ).toBeOnTheScreen();
    });

    it("is not a tab, because it is not a place to look for a thing", async () => {
      await renderApp({ session: aSession() });

      await screen.findByText(/scan a label/i);

      expect(screen.queryByRole("button", { name: "Background removal" })).toBeNull();
    });
  });

  describe("in Spanish", () => {
    it("says the whole screen in the language on screen", async () => {
      theApiSays(someProcessing());

      await renderApp({ session: aSession(), screen: atTheQueue, language: "es" });

      expect(
        await screen.findByRole("header", { name: "Recorte del fondo" }),
      ).toBeOnTheScreen();
    });
  });
});

/**
 * # What a bulk retry makes stale
 *
 * `useReprocessPhoto` throws away the inventory AND the queue: a photo put
 * back changes the note under it on the item's own screen, and it changes the
 * counts on this one. `useRetryFailedPhotos` — the same idea for every failed
 * photo at once — threw away only the queue, so the item screen underneath
 * went on saying "background removal failed" about photos that had just been
 * requeued, until something else happened to refetch it. The web client
 * invalidates both for both.
 *
 * The screen this is pressed on is reached FROM a failed photo, so the screen
 * holding the stale note is almost always still mounted right underneath it.
 */
describe("what a retry makes stale", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  const anItemWithAFailedPhoto = (): { asked: () => number } => {
    let asks = 0;
    const drill = anItem({
      id: "drill",
      storageUnitId: "box3",
      name: "Cordless drill",
      photos: [aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.FAILED })],
    });

    apiServer.use(
      http.get(`${API_URL}/items/drill`, () => {
        asks += 1;

        return HttpResponse.json({ item: drill, storageUnit: box, path: [garage, wardrobe, box] });
      }),
      http.get(`${API_URL}/photos/p1/thumbnail`, () =>
        HttpResponse.arrayBuffer(new ArrayBuffer(8), {
          headers: { "content-type": "image/jpeg" },
        }),
      ),
    );

    return { asked: () => asks };
  };

  const fromTheFailedPhotoToTheQueue = async (): Promise<void> => {
    await renderApp({ session: aSession(), screen: { name: "Item", params: { id: "drill" } } });
    await fireEvent.press(
      await screen.findByRole("link", { name: "See every photo that failed" }),
    );
    await screen.findByRole("header", { name: "Background removal" });
  };

  /**
   * The control. One photo has always done this, so if the harness could not
   * see an invalidation at all, this would fail too and the next assertion
   * would be proving nothing.
   */
  it("asks the item again after ONE photo has been put back", async () => {
    theApiSays(
      someProcessing({
        counts: { PENDING: 0, DONE: 1, FAILED: 1, SKIPPED: 0 },
        abandoned: [anAbandonedPhoto({ photoId: "p1" })],
      }),
    );
    const item = anItemWithAFailedPhoto();
    apiServer.use(
      http.post(`${API_URL}/photos/p1/reprocess`, () =>
        HttpResponse.json({ photo: aPhoto({ id: "p1" }) }, { status: 202 }),
      ),
    );

    await fromTheFailedPhotoToTheQueue();
    await waitFor(() => {
      expect(item.asked()).toBe(1);
    });

    await fireEvent.press(await screen.findByRole("button", { name: "Try p1 again" }));

    await waitFor(() => {
      expect(item.asked()).toBe(2);
    });
  });

  it("asks the item again after EVERY failed photo has been put back", async () => {
    theApiSays(
      someProcessing({
        counts: { PENDING: 0, DONE: 1, FAILED: 4, SKIPPED: 0 },
        abandoned: [anAbandonedPhoto({ photoId: "p1" })],
      }),
    );
    const item = anItemWithAFailedPhoto();
    apiServer.use(
      http.post(`${API_URL}/photos/processing/retry`, () =>
        HttpResponse.json({ requeued: 4 }, { status: 202 }),
      ),
    );

    await fromTheFailedPhotoToTheQueue();
    await waitFor(() => {
      expect(item.asked()).toBe(1);
    });

    await fireEvent.press(
      await screen.findByRole("button", { name: "Retry every failed photo" }),
    );

    await waitFor(() => {
      expect(item.asked()).toBe(2);
    });
  });
});
