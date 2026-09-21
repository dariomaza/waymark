import { describe, expect, it } from "vitest";

import { API_ROOT_SEGMENTS, navigateFallbackDenylist } from "./api-namespace.js";
import { ROUTES, thingPath, unitPath } from "./routes.js";

const firstSegmentOf = (path: string): string =>
  path.replace(/^\/+/u, "").split("/")[0] ?? "";

describe("the addresses this app answers to", () => {
  it("never takes one the API already owns", () => {
    // The API serves this client from its own origin, so a screen at `/items`
    // is not a screen: `GET /items` is a route, and a browser opening that URL
    // is handed JSON. It looks like it works as soon as the service worker is
    // installed, because `navigateFallback` draws the shell from the cache —
    // so the only person who ever meets the bug is somebody following a link
    // for the first time, which is the worst possible audience for it.
    const shadowed = Object.entries(ROUTES).filter(([, path]) =>
      API_ROOT_SEGMENTS.includes(firstSegmentOf(path)),
    );

    expect(shadowed).toEqual([]);
  });

  it("keeps the two screens whose addresses are a contract", () => {
    // `/` is the manifest's `start_url`, and `/u/:publicId` is glued to boxes
    // (ADR 12). Neither may move to make room for anything.
    expect(ROUTES.inventory).toBe("/");
    expect(ROUTES.scannedLabel).toBe("/u/:publicId");
  });

  it("builds every link from the same table the router is built from", () => {
    expect(unitPath("abc")).toBe(ROUTES.unit.replace(":id", "abc"));
    expect(thingPath("abc")).toBe(ROUTES.thing.replace(":id", "abc"));
  });
});

describe("what the service worker refuses to draw the app for", () => {
  it.each([
    ["the whole inventory", "/items"],
    ["one item", "/items/6f1b0d3e"],
    ["the forest", "/storage-units"],
    ["a search", "/search"],
    ["a photo", "/photos/6f1b0d3e"],
    ["signing in", "/auth/login"],
    ["the health probe", "/health"],
  ])("leaves %s to the API", (_what, path) => {
    expect(navigateFallbackDenylist.some((pattern) => pattern.test(path))).toBe(
      true,
    );
  });

  it.each([
    ["the inventory screen", "/"],
    ["a unit", "/units/6f1b0d3e"],
    ["a scanned label", "/u/ABCDEFGHJK"],
    ["a name that merely starts the same way", "/itemsomething"],
  ])("still draws the app for %s", (_what, path) => {
    expect(navigateFallbackDenylist.some((pattern) => pattern.test(path))).toBe(
      false,
    );
  });
});
