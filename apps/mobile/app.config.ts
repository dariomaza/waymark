import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * # Why there is a `.ts` beside `app.json`
 *
 * Everything that is the same in every build stays in `app.json`, where it is
 * readable and where `expo` writes when a tool edits it. This file exists for
 * the one field that CANNOT be written down in a public repository: the
 * hostname of somebody's own Waymark.
 *
 * Expo reads both. When an `app.config.ts` exists it is the config, and the
 * static file is handed to it as `config` — so the spread below is not a
 * convenience, it is the whole of `app.json` and this file only says what it
 * changes. Adding a key to `app.json` needs no edit here.
 *
 * This runs in NODE, at build time, on whichever machine is bundling — not in
 * the app. `URL` is the real one here, unlike in `src/app/api-endpoint.ts`
 * where React Native's partial implementation is the reason that module does
 * string surgery instead.
 */

/**
 * The same default as `src/app/create-client.ts`, and deliberately the same
 * string. It is loopback INSIDE the phone, which is right for an emulator and
 * wrong everywhere else — and, being `http:`, it produces no intent filter at
 * all, which is the honest answer for a build that was never told where its
 * server is.
 */
const DEFAULT_API_URL = "http://127.0.0.1:3000";

/**
 * Where the labels point, as a hostname Android can be asked to open.
 *
 * A printed label encodes `<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>` (ADR 12),
 * and one container serves the API and the web client on one origin (ADR 16)
 * — so the host on the sticker IS the host of the API address this build was
 * given. Deriving it rather than taking a second setting is what stops an APK
 * from claiming links it cannot then load.
 *
 * `null` for anything that is not `https:`. Android verifies nothing else, a
 * LAN address over `http:` is a development machine rather than a place
 * stickers point at, and the placeholder that used to sit here meant the
 * stock camera opened a browser instead of this app. Claiming no host is
 * better than claiming the wrong one: `waymark://u/<code>` still works, and
 * the label still opens the web client exactly as it does today.
 */
const labelHost = (apiUrl: string): { host: string; port?: string } | null => {
  let parsed: URL;

  try {
    parsed = new URL(apiUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  // `URL` blanks the port when it is the scheme's default, which is what the
  // intent filter wants too: naming 443 there would stop it matching a URL
  // written without it.
  return parsed.port === "" ? { host: parsed.hostname } : { host: parsed.hostname, port: parsed.port };
};

/**
 * The `https` half of the deep link, present only when there is a real host.
 *
 * The `waymark://` scheme is not here: it comes from `scheme` in `app.json`
 * and needs no host, so scanning a code inside the app works in every build.
 */
const httpsIntentFilters = (
  apiUrl: string,
): NonNullable<NonNullable<ExpoConfig["android"]>["intentFilters"]> => {
  const target = labelHost(apiUrl);

  if (target === null) {
    return [];
  }

  return [
    {
      action: "VIEW",
      // No `assetlinks.json` is served, so Android cannot verify this app owns
      // the domain and must not hand it the link silently. `false` is what
      // makes it an offer in the chooser rather than a hijack.
      autoVerify: false,
      data: [{ scheme: "https", ...target, pathPrefix: "/u" }],
      category: ["BROWSABLE", "DEFAULT"],
    },
  ];
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env["EXPO_PUBLIC_WAYMARK_API_URL"] ?? DEFAULT_API_URL;

  return {
    ...config,
    // `ConfigContext` types the static config as partial, because a dynamic
    // config is allowed to be the only one. This one is not: `app.json` has
    // both, and the app has no name to fall back to.
    name: config.name ?? "Waymark",
    slug: config.slug ?? "waymark",
    android: {
      ...config.android,
      intentFilters: httpsIntentFilters(apiUrl),
    },
  };
};
