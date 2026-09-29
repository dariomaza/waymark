import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DARK, MARK_SMALL, shapesOf } from "@waymark/tokens";

/**
 * # The half of the browser client that is not JavaScript
 *
 * The tab's icon, the one an iPhone puts on its home screen, and the ones an
 * installed PWA is drawn with. When the mark changed from three rings to the
 * w with the pin, these PNGs turned out to be older than the rings: they still
 * drew the thread, two marks ago, because nothing looked at them and nothing
 * could fail when they went stale.
 *
 * What is drawn in a PNG is a thing to look at rather than a thing to assert.
 * What CAN be asserted is the join — every icon `index.html` and the manifest
 * name is a file in `public/`, at the size it is declared as — and that the
 * one icon written as text, the favicon, is the same mark the clients draw.
 *
 * Read rather than imported: `vite.config.ts` pulls in the whole build, and
 * this is a test about what is on disk.
 */
const WEB = process.cwd();
const PUBLIC = join(WEB, "public");
const INDEX = readFileSync(join(WEB, "index.html"), "utf8");
const CONFIG = readFileSync(join(WEB, "vite.config.ts"), "utf8");
const FAVICON = readFileSync(join(PUBLIC, "favicon.svg"), "utf8");

/** A PNG's width and height, from its header: bytes 16 to 24, big-endian. */
const pixelsOf = (file: string): string => {
  const png = readFileSync(join(PUBLIC, file));

  return `${String(png.readUInt32BE(16))}x${String(png.readUInt32BE(20))}`;
};

const MANIFEST_ICONS = [...CONFIG.matchAll(/src: "([^"]+)",\s*sizes: "([^"]+)"/gu)].map(
  ([, src, sizes]) => ({ src: String(src), sizes: String(sizes) }),
);

describe("the icons the browser is handed", () => {
  /** The control: a pattern that found nothing would make the next test vacuous. */
  it("finds the icons the manifest lists", () => {
    expect(MANIFEST_ICONS.map(({ src }) => src)).toEqual([
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
    ]);
  });

  it("has every icon the manifest lists, at the size it says", () => {
    for (const { src, sizes } of MANIFEST_ICONS) {
      expect(existsSync(join(PUBLIC, src))).toBe(true);
      expect(pixelsOf(src)).toBe(sizes);
    }
  });

  it("has the icons the page itself links, and the home-screen one at Apple's size", () => {
    expect(INDEX).toContain('href="/favicon.svg"');
    expect(INDEX).toContain('href="/apple-touch-icon.png"');
    expect(existsSync(join(PUBLIC, "favicon.svg"))).toBe(true);
    expect(pixelsOf("apple-touch-icon.png")).toBe("180x180");
  });
});

describe("the favicon", () => {
  /**
   * The small cut, with the solid pin — at 16 pixels the full pin's hole and
   * core would close up — and the very outlines the icon atoms draw, rather
   * than a third copy of the mark to keep honest by hand.
   */
  it("is the mark both clients draw, the small cut", () => {
    const drawn = [...FAVICON.matchAll(/<path[^>]* d="([^"]+)"/gu)].map(([, d]) => d);

    expect(drawn).toEqual(shapesOf(MARK_SMALL).map((shape) => shape.d));
  });

  /** Lime on the ink, the one pairing the brand allows the lime in. */
  it("is the accent on the app's own surface, filled and never stroked", () => {
    expect(FAVICON).toContain(`fill="${DARK.surface}"`);
    expect(FAVICON).toContain(`fill="${DARK.accent}"`);
    expect(FAVICON).not.toMatch(/stroke/u);
  });
});
