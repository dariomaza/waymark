import { anItem, aStorageUnit, aTree } from "@ariadna/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "./api-server.js";

/**
 * One house, shared by the tests that need somewhere to look.
 *
 * A garage, a metal wardrobe inside it, a box inside that, and a drill in the
 * box — four levels, which is the depth ADR 1 sized the tree at, and enough
 * for a breadcrumb to be worth drawing.
 */
export const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });

export const wardrobe = aStorageUnit({
  id: "wardrobe",
  parentId: "garage",
  name: "Metal wardrobe",
  kind: "FURNITURE",
});

export const box = aStorageUnit({
  id: "box3",
  parentId: "wardrobe",
  name: "Box 3",
  publicId: "7ZK3QWERTY",
});

export const drill = anItem({
  id: "drill",
  storageUnitId: "box3",
  name: "Cordless drill",
});

/** The handlers a signed-in screen needs before it can draw anything. */
export const theApiKnowsTheHouse = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({ tree: [aTree(garage, [aTree(wardrobe, [aTree(box)])])] }),
    ),
    http.get(`${API_URL}/storage-units/garage`, () =>
      HttpResponse.json({
        unit: garage,
        path: [garage],
        children: [wardrobe],
        items: [],
      }),
    ),
    http.get(`${API_URL}/storage-units/wardrobe`, () =>
      HttpResponse.json({
        unit: wardrobe,
        path: [garage, wardrobe],
        children: [box],
        items: [],
      }),
    ),
    http.get(`${API_URL}/storage-units/box3`, () =>
      HttpResponse.json({
        unit: box,
        path: [garage, wardrobe, box],
        children: [],
        items: [drill],
      }),
    ),
  );
};
