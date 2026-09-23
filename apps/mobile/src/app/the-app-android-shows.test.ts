import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * # The half of the app that is not JavaScript
 *
 * The first APK installed with the stock green robot on the launcher, because
 * `app.json` named no icon and there were no files for it to name. Nothing in
 * this suite could have caught that: drawing a PNG is ImageMagick's job (see
 * `assets/render-icons.sh`), and what it draws is a thing to look at rather
 * than a thing to assert.
 *
 * What CAN be asserted is the join — that every path the config hands the
 * Android build is a file that is actually in the tree. That is the failure
 * that happened, and it is the one that comes back: a renamed asset, a
 * `render-icons.sh` run in the wrong directory, a PNG left out of a commit.
 * `expo prebuild` would say so too, on a build machine, ten minutes later.
 *
 * The mark itself is `assets/waypoints.svg`, and it is the same drawing as
 * `src/ui/atoms/icon.tsx` — the three waypoints in the top bar. That one is
 * kept honest by the comment at the head of the SVG and by eye; two
 * renderings of a shape are not comparable as text.
 *
 * The file is READ rather than imported, because this is a test about what is
 * on disk. An import would be type-checked against a snapshot of today's keys
 * and tell us nothing about the bytes `expo prebuild` will open.
 */
const MOBILE = resolve(__dirname, "../..");

interface SplashOptions {
  readonly image?: string;
  readonly imageWidth?: number;
  readonly resizeMode?: string;
  readonly backgroundColor?: string;
}

interface AppConfig {
  readonly expo: {
    readonly icon?: string;
    readonly backgroundColor?: string;
    readonly splash?: unknown;
    readonly android?: {
      readonly adaptiveIcon?: {
        readonly foregroundImage?: string;
        readonly backgroundColor?: string;
      };
    };
    readonly plugins?: readonly (string | readonly [string, SplashOptions])[];
  };
}

const config = JSON.parse(readFileSync(resolve(MOBILE, "app.json"), "utf8")) as AppConfig;

/** Whether the path the config gave is a file the build will find. */
const isThere = (named: string | undefined): boolean =>
  named !== undefined && existsSync(resolve(MOBILE, named));

describe("what Android is handed to draw", () => {
  it("names a launcher icon, and it is there", () => {
    expect(config.expo.icon).toBe("./assets/icon.png");
    expect(isThere(config.expo.icon)).toBe(true);
  });

  /**
   * The adaptive icon is the one Android 8 and everything after it actually
   * shows. It is two layers — a transparent foreground and a flat colour —
   * because the launcher masks them to a circle, a squircle or a rounded
   * square of its own choosing, and may animate them apart.
   */
  it("names an adaptive foreground and a colour behind it, and the foreground is there", () => {
    const adaptive = config.expo.android?.adaptiveIcon;

    expect(adaptive?.foregroundImage).toBe("./assets/adaptive-icon.png");
    expect(isThere(adaptive?.foregroundImage)).toBe(true);
    expect(adaptive?.backgroundColor).toBe("#101011");
  });

  /**
   * Through the config plugin, which is how a launch screen is declared from
   * SDK 52 on. The top-level `splash` key still parses and does nothing, which
   * is the quietest way to ship an app with no launch screen at all — so this
   * asserts the plugin, and asserts the old key is absent rather than wrong.
   */
  it("names a splash image through the plugin the SDK reads, and it is there", () => {
    const splash = (config.expo.plugins ?? []).find(
      (plugin): plugin is readonly [string, SplashOptions] =>
        Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
    );

    expect(splash).toBeDefined();
    expect(splash?.[1].image).toBe("./assets/splash-icon.png");
    expect(isThere(splash?.[1].image)).toBe(true);
    expect(splash?.[1].backgroundColor).toBe("#101011");
    expect(config.expo.splash).toBeUndefined();
  });

  /**
   * One near-black, in four places: the tokens the app is drawn with, the
   * window behind the first frame, the adaptive icon's back layer and the
   * launch screen. A splash in a different dark to the app it opens is a
   * flicker on every cold start.
   */
  it("uses the app's own surface colour behind everything it draws", () => {
    expect(config.expo.backgroundColor).toBe("#101011");
  });
});
