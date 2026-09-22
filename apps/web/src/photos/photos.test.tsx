import type { PhotoView } from "@waymark/api-client";
import { PhotoProcessingStatus } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, aPhoto, aSession, aStorageUnit, aTree, withPhoto } from "@waymark/api-client/testing";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({ id: "box3", parentId: "garage", name: "Box 3" });

/** Three bytes standing in for a JPEG; nothing decodes them in jsdom. */
const someBytes = (): Response =>
  HttpResponse.arrayBuffer(new Uint8Array([255, 216, 255]).buffer, {
    headers: { "content-type": "image/jpeg" },
  });

const servesPhotos = (): void => {
  apiServer.use(
    http.get(`${API_URL}/photos/:id`, () => someBytes()),
    http.get(`${API_URL}/photos/:id/thumbnail`, () => someBytes()),
  );
};

const signedIn = (): void => {
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({ tree: [aTree(garage, [aTree(box)])] }),
    ),
  );
};

const aJpeg = (name = "drill.jpg"): File =>
  new File([new Uint8Array([255, 216, 255])], name, { type: "image/jpeg" });

describe("photos", () => {
  beforeEach(() => {
    signedIn();
    servesPhotos();
  });

  it("shows an item's photos, the cover first", async () => {
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            photos: ["p1", "p2"],
          }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
    );

    renderApp({ route: "/things/drill" });

    const gallery = await screen.findByRole("list", { name: /photos/i });
    expect(within(gallery).getAllByRole("img")).toHaveLength(2);
    expect(within(gallery).getAllByRole("img")[0]).toHaveAccessibleName(
      /cover photo of cordless drill/i,
    );

    // The bytes arrive over an authenticated request and are handed to the
    // DOM as an object URL, so the element is replaced once they land.
    await waitFor(() => {
      expect(
        within(gallery).getAllByRole("img")[0]?.getAttribute("src"),
      ).toMatch(/^blob:/);
    });
  });

  it("shows a photo whose background removal has not happened, and may never", async () => {
    let photos: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            photos,
          }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
      http.post(`${API_URL}/items/drill/photos`, () => {
        photos = ["p1"];

        return HttpResponse.json(
          {
            photo: aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.PENDING }),
            item: anItem({ id: "drill", storageUnitId: "box3", photos }),
          },
          { status: 201 },
        );
      }),
    );

    renderApp({ route: "/things/drill" });

    await userEvent.upload(await screen.findByLabelText(/add a photo/i), aJpeg());

    // The original is shown immediately. Background removal is optional, runs
    // out of process, and may never finish (ADR 4) — nothing waits for it.
    const gallery = await screen.findByRole("list", { name: /photos/i });
    await waitFor(() => {
      expect(within(gallery).getAllByRole("img")[0]?.getAttribute("src")).toMatch(
        /^blob:/,
      );
    });
    expect(screen.getByText(/background removal is still pending/i)).toBeVisible();
  });

  it("says WHICH photo is still waiting for its background to be removed", async () => {
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            photos: [
              aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.DONE }),
              aPhoto({ id: "p2", processingStatus: PhotoProcessingStatus.PENDING }),
            ],
          }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
    );

    renderApp({ route: "/things/drill" });

    // Only the pending one says anything. A finished photo is just a photo,
    // and a note on every cell would be noise (ADR 4).
    const notes = await screen.findAllByText(/background removal is still pending/i);
    expect(notes).toHaveLength(1);

    const cells = within(await screen.findByRole("list", { name: /photos/i })).getAllByRole(
      "listitem",
    );
    expect(cells[1]).toContainElement(notes[0] ?? null);
  });

  it("takes every photo URL from the API rather than building one", async () => {
    const asked: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            photos: ["p1"],
          }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
      http.get(`${API_URL}/photos/:id/thumbnail`, ({ request }) => {
        asked.push(new URL(request.url).pathname);

        return someBytes();
      }),
    );

    renderApp({ route: "/things/drill" });

    await waitFor(() => {
      expect(asked).toEqual(["/photos/p1/thumbnail"]);
    });
  });

  it("chooses the cover by reordering, because that is what a cover is", async () => {
    const orders: unknown[] = [];
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            photos: ["p1", "p2"],
          }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
      http.post(`${API_URL}/items/drill/photos/order`, async ({ request }) => {
        orders.push(await request.json());

        return HttpResponse.json({
          item: anItem({ id: "drill", storageUnitId: "box3", photos: ["p2", "p1"] }),
        });
      }),
    );

    renderApp({ route: "/things/drill" });

    await userEvent.click(
      await screen.findByRole("button", { name: /make photo 2 the cover/i }),
    );

    await waitFor(() => {
      expect(orders).toEqual([{ photoIds: ["p2", "p1"] }]);
    });
  });

  it("deletes a photo from an item", async () => {
    let deleted: string | null = null;
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            photos: deleted === null ? ["p1"] : [],
          }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
      http.delete(`${API_URL}/items/drill/photos/p1`, () => {
        deleted = "p1";

        return HttpResponse.json({
          item: anItem({ id: "drill", storageUnitId: "box3", photos: [] }),
          releasedPhotoIds: ["p1"],
        });
      }),
    );

    renderApp({ route: "/things/drill" });

    await userEvent.click(await screen.findByRole("button", { name: /delete photo 1/i }));

    await waitFor(() => {
      expect(deleted).toBe("p1");
    });
  });

  it("says the item is full rather than losing an eleventh photo quietly", async () => {
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({ id: "drill", storageUnitId: "box3", name: "Cordless drill" }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
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

    renderApp({ route: "/things/drill" });

    await userEvent.upload(await screen.findByLabelText(/add a photo/i), aJpeg());

    expect(await screen.findByText(/already holds 10 photos/i)).toBeVisible();
  });

  it("puts a photo on a storage unit, and takes it off again", async () => {
    // The unit carries the whole photo, not an id, so nothing in the app
    // builds a photo URL from it.
    let photo: PhotoView | null = null;
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({
          unit: withPhoto(box, photo),
          path: [garage, box],
          children: [],
          items: [],
        }),
      ),
      http.post(`${API_URL}/storage-units/box3/photo`, () => {
        photo = aPhoto({ id: "p9" });

        return HttpResponse.json(
          {
            photo,
            unit: withPhoto(box, photo),
            releasedPhotoIds: [],
          },
          { status: 201 },
        );
      }),
      http.delete(`${API_URL}/storage-units/box3/photo`, () => {
        photo = null;

        return HttpResponse.json({
          unit: withPhoto(box, null),
          releasedPhotoIds: ["p9"],
        });
      }),
    );

    renderApp({ route: "/units/box3" });

    await userEvent.upload(await screen.findByLabelText(/add a photo/i), aJpeg("box.jpg"));

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /photo of box 3/i })).toBeInTheDocument();
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /remove this photo/i }),
    );

    await waitFor(() => {
      expect(photo).toBeNull();
    });
  });
});

/**
 * # Retrying a background removal that failed
 *
 * ADR 4 left it as an open consequence — "`FAILED` photos need a retry path,
 * otherwise they stay unprocessed forever" — and ADR 10 built two routes for
 * it. Until now neither had a button anywhere, which means a photo that
 * failed at 4% battery in a garage stayed failed for ever no matter how
 * thoroughly the sidecar was fixed afterwards.
 *
 * A failed photo is not a problem the person has to solve, so the retry is
 * an action on a note rather than an alert: the original is on the screen and
 * stays there either way.
 */
describe("a background removal that failed", () => {
  beforeEach(() => {
    signedIn();
    servesPhotos();
  });

  const aFailedPhoto = aPhoto({
    id: "p1",
    processingStatus: PhotoProcessingStatus.FAILED,
  });

  const anItemWithAFailedPhoto = (): void => {
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({
            id: "drill",
            storageUnitId: "box3",
            name: "Cordless drill",
            photos: [aFailedPhoto],
          }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
    );
  };

  it("can be asked for again from the photo it happened to", async () => {
    const asked: string[] = [];
    anItemWithAFailedPhoto();
    apiServer.use(
      http.post(`${API_URL}/photos/p1/reprocess`, ({ request }) => {
        asked.push(new URL(request.url).pathname);

        return HttpResponse.json(
          { photo: aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.PENDING }) },
          { status: 202 },
        );
      }),
    );

    renderApp({ route: "/things/drill" });

    expect(await screen.findByText(/background removal failed/i)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: /try removing the background again/i }),
    );

    await waitFor(() => {
      expect(asked).toEqual(["/photos/p1/reprocess"]);
    });
  });

  it("offers nothing to press on a photo that is merely still pending", async () => {
    apiServer.use(
      http.get(`${API_URL}/items/drill`, () =>
        HttpResponse.json({
          item: anItem({ id: "drill", storageUnitId: "box3", photos: ["p1"] }),
          storageUnit: box,
          path: [garage, box],
        }),
      ),
    );

    renderApp({ route: "/things/drill" });

    expect(await screen.findByText(/still pending/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /try removing the background again/i }),
    ).toBeNull();
  });

  it("can be asked for again from a unit's own photo too", async () => {
    const asked: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({
          unit: withPhoto(box, aFailedPhoto),
          path: [garage, box],
          children: [],
          items: [],
        }),
      ),
      http.post(`${API_URL}/photos/p1/reprocess`, () => {
        asked.push("asked");

        return HttpResponse.json({ photo: aFailedPhoto }, { status: 202 });
      }),
    );

    renderApp({ route: "/units/box3" });

    expect(await screen.findByText(/background removal failed/i)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: /try removing the background again/i }),
    );

    await waitFor(() => {
      expect(asked).toEqual(["asked"]);
    });
  });

  it("points at the screen that knows about every other photo that failed", async () => {
    anItemWithAFailedPhoto();
    apiServer.use(
      http.get(`${API_URL}/photos/processing`, () =>
        HttpResponse.json({
          processor: { enabled: true, url: "http://rembg:7000", reachable: true },
          counts: { PENDING: 0, DONE: 4, FAILED: 3, SKIPPED: 1 },
          abandoned: [],
        }),
      ),
    );

    renderApp({ route: "/things/drill" });

    await userEvent.click(
      await screen.findByRole("link", { name: /every photo that failed/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /background removal/i }),
    ).toBeVisible();
  });
});

/**
 * # The screen for the person who runs the sidecar
 *
 * `GET /photos/processing` exists so "is it on" and "how many are stuck" do
 * not need SSH and a SQL client (ADR 10), and it had no screen. It is not in
 * the bottom navigation, and that is deliberate: background removal is a
 * secondary feature that must never take space from the primary one (ADR 4).
 * It is reached from the one place somebody has just met the problem — a
 * photo whose removal failed.
 */
describe("what background removal is doing", () => {
  beforeEach(() => {
    signedIn();
    servesPhotos();
  });

  const processingIs = (body: Record<string, unknown>): void => {
    apiServer.use(http.get(`${API_URL}/photos/processing`, () => HttpResponse.json(body)));
  };

  it("says the feature is switched off rather than broken", async () => {
    processingIs({
      processor: { enabled: false, url: null, reachable: null },
      counts: { PENDING: 12, DONE: 0, FAILED: 0, SKIPPED: 0 },
      abandoned: [],
    });

    renderApp({ route: "/processing" });

    expect(await screen.findByText(/switched off/i)).toBeVisible();
    // A complete installation, so the pending photos are not a complaint.
    expect(screen.getByText(/^12$/u)).toBeVisible();
  });

  it("says when a sidecar is configured and not answering", async () => {
    processingIs({
      processor: { enabled: true, url: "http://rembg:7000", reachable: false },
      counts: { PENDING: 3, DONE: 0, FAILED: 0, SKIPPED: 0 },
      abandoned: [],
    });

    renderApp({ route: "/processing" });

    expect(await screen.findByText(/not answering/i)).toBeVisible();
    expect(screen.getByText(/rembg:7000/u)).toBeVisible();
  });

  it("lists what was given up on, with the reason and what it cost", async () => {
    processingIs({
      processor: { enabled: true, url: "http://rembg:7000", reachable: true },
      counts: { PENDING: 0, DONE: 1, FAILED: 1, SKIPPED: 0 },
      abandoned: [
        {
          photoId: "p1",
          attempts: 5,
          lastError: "415 cannot decode this image",
          lastAttemptAt: "2026-09-21T10:00:00.000Z",
          url: "/photos/p1",
        },
      ],
    });

    renderApp({ route: "/processing" });

    expect(await screen.findByText(/415 cannot decode this image/i)).toBeVisible();
    expect(screen.getByText(/5 attempts/i)).toBeVisible();
  });

  it("puts every failed photo back in the queue in one press", async () => {
    let requeued = 0;
    processingIs({
      processor: { enabled: true, url: "http://rembg:7000", reachable: true },
      counts: { PENDING: 0, DONE: 0, FAILED: 3, SKIPPED: 0 },
      abandoned: [],
    });
    apiServer.use(
      http.post(`${API_URL}/photos/processing/retry`, () => {
        requeued = 3;

        return HttpResponse.json({ requeued }, { status: 202 });
      }),
    );

    renderApp({ route: "/processing" });

    await userEvent.click(
      await screen.findByRole("button", { name: /retry every failed photo/i }),
    );

    await waitFor(() => {
      expect(requeued).toBe(3);
    });
    expect(await screen.findByText(/3 photos are back in the queue/i)).toBeVisible();
  });

  it("offers no bulk retry when nothing has failed", async () => {
    processingIs({
      processor: { enabled: true, url: "http://rembg:7000", reachable: true },
      counts: { PENDING: 0, DONE: 9, FAILED: 0, SKIPPED: 0 },
      abandoned: [],
    });

    renderApp({ route: "/processing" });

    expect(await screen.findByText(/nothing has failed/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /retry every failed photo/i }),
    ).toBeNull();
  });

  it("retries one abandoned photo from the list", async () => {
    const asked: string[] = [];
    processingIs({
      processor: { enabled: true, url: "http://rembg:7000", reachable: true },
      counts: { PENDING: 0, DONE: 0, FAILED: 1, SKIPPED: 0 },
      abandoned: [
        {
          photoId: "p1",
          attempts: 5,
          lastError: "415 cannot decode this image",
          lastAttemptAt: "2026-09-21T10:00:00.000Z",
          url: "/photos/p1",
        },
      ],
    });
    apiServer.use(
      http.post(`${API_URL}/photos/p1/reprocess`, () => {
        asked.push("p1");

        return HttpResponse.json({ photo: aPhoto({ id: "p1" }) }, { status: 202 });
      }),
    );

    renderApp({ route: "/processing" });

    await userEvent.click(await screen.findByRole("button", { name: /try p1 again/i }));

    await waitFor(() => {
      expect(asked).toEqual(["p1"]);
    });
  });
});
