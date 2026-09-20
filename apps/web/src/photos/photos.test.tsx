import { PhotoProcessingStatus } from "@ariadna/domain";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { anItem, aPhoto, aSession, aStorageUnit, aTree } from "@ariadna/api-client/testing";
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

    renderApp({ route: "/items/drill" });

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

    renderApp({ route: "/items/drill" });

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

    renderApp({ route: "/items/drill" });

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

    renderApp({ route: "/items/drill" });

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

    renderApp({ route: "/items/drill" });

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

    renderApp({ route: "/items/drill" });

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

    renderApp({ route: "/items/drill" });

    await userEvent.upload(await screen.findByLabelText(/add a photo/i), aJpeg());

    expect(await screen.findByText(/already holds 10 photos/i)).toBeVisible();
  });

  it("puts a photo on a storage unit, and takes it off again", async () => {
    let photoId: string | null = null;
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({
          unit: { ...box, photoId },
          path: [garage, box],
          children: [],
          items: [],
        }),
      ),
      http.post(`${API_URL}/storage-units/box3/photo`, () => {
        photoId = "p9";

        return HttpResponse.json(
          {
            photo: aPhoto({ id: "p9" }),
            unit: { ...box, photoId },
            releasedPhotoIds: [],
          },
          { status: 201 },
        );
      }),
      http.delete(`${API_URL}/storage-units/box3/photo`, () => {
        photoId = null;

        return HttpResponse.json({ unit: box, releasedPhotoIds: ["p9"] });
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
      expect(photoId).toBeNull();
    });
  });
});
