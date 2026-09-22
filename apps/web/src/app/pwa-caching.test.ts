import { describe, expect, it } from "vitest";

import { cacheNameFor, RUNTIME_CACHING } from "./pwa-caching.js";

/**
 * # ADR 13's list, as a test rather than as a comment
 *
 * ADR 13 decided exactly what works with no connection: the shell, the photos
 * already seen, and the forest of storage units. Everything else is a live
 * request or nothing, and no write is ever queued.
 *
 * That list was a prose paragraph and a `runtimeCaching` array that only a
 * production build ever evaluates, which means the two could drift and the
 * failure would be invisible: a route quietly served from a cache is not an
 * error anywhere, it is a screen that is confidently out of date.
 *
 * So the patterns are pinned here by the one thing that matters about them —
 * which URL gets which cache, and which URLs get none.
 */
describe("what the service worker holds", () => {
  it("caches a photo, because a stored file never changes once it settles", () => {
    expect(cacheNameFor("/photos/p1")).toBe("waymark-photos");
    expect(cacheNameFor("/photos/p1/thumbnail")).toBe("waymark-photos");
  });

  it("caches the forest, so the home screen draws with no signal", () => {
    expect(cacheNameFor("/storage-units")).toBe("waymark-inventory");
  });

  /**
   * ADR 15 made "everything you own" one unpaginated request, months after
   * ADR 13 drew its list. It is a read, it is one URL, and with no signal the
   * alternative to a stale list is a screen with nothing on it at all —
   * which is the exact failure the forest is cached to avoid.
   */
  it("caches every item, for the same reason it caches the forest", () => {
    expect(cacheNameFor("/items")).toBe("waymark-inventory");
  });

  it("holds the two of them together, under one bounded cache", () => {
    const inventory = RUNTIME_CACHING.filter(
      (entry) => entry.options.cacheName === "waymark-inventory",
    );

    expect(inventory).toHaveLength(1);
    // A live answer always wins; the cached one is only ever the fallback for
    // a dead connection.
    expect(inventory[0]?.handler).toBe("NetworkFirst");
  });

  it("never caches a search, because a stale answer is a lie about the house", () => {
    expect(cacheNameFor("/search")).toBeNull();
  });

  /**
   * Both are reached from a list that IS cached, both are per-id so the cache
   * would grow without a bound anybody chose, and both change on every write
   * — and a write is the one thing that is never queued (ADR 13).
   */
  it("never caches one unit or one item", () => {
    expect(cacheNameFor("/storage-units/box3")).toBeNull();
    expect(cacheNameFor("/items/drill")).toBeNull();
  });

  /**
   * `/photos/processing` sits under `/photos/`, which is a `CacheFirst` cache.
   * It describes a queue that moves on its own, so a cached answer is exactly
   * the failure that screen exists to prevent: a number that stopped being
   * true while somebody was looking at it.
   */
  it("never caches what background removal is doing, despite the path it sits on", () => {
    expect(cacheNameFor("/photos/processing")).toBeNull();
  });

  it("never caches anything about the session", () => {
    expect(cacheNameFor("/auth/me")).toBeNull();
    expect(cacheNameFor("/auth/login")).toBeNull();
  });

  it("bounds every cache it does keep, because this runs on a phone", () => {
    for (const entry of RUNTIME_CACHING) {
      expect(entry.options.expiration.maxEntries).toBeGreaterThan(0);
      expect(entry.options.expiration.maxAgeSeconds).toBeGreaterThan(0);
      // A refusal or a redirect must never be the thing that is remembered.
      expect(entry.options.cacheableResponse.statuses).toEqual([200]);
    }
  });
});
