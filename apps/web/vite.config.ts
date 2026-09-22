import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { navigateFallbackDenylist } from "./src/app/api-namespace.js";
import { workboxRuntimeCaching } from "./src/app/pwa-caching.js";

/**
 * # The web client
 *
 * A single page app served BY the API, from the API's own origin, talking to
 * it with a bearer token (ADR 6). One container, one hostname on the tunnel,
 * and no CORS for this client at all: a same-origin request is not a
 * cross-origin one, so there is nothing for an allowlist to allow.
 * `VITE_WAYMARK_API_URL` is therefore unset for a production build, and the
 * bundle carries no hostname — see `src/app/create-client.ts`.
 *
 * The cost is that one origin now holds two namespaces, and a path belongs to
 * exactly one of them. `src/app/api-namespace.ts` is that boundary on this
 * side: which paths this app must not name a screen after, and which ones the
 * service worker must not draw the app for.
 *
 * ## What is cached, and what is not
 *
 * The shell — the document, the bundle, the stylesheet, the icons — is
 * precached, so Waymark opens in the corner of a garage with no signal
 * instead of showing the browser's offline page.
 *
 * Which API reads are cached, and which are deliberately never cached, is
 * `src/app/pwa-caching.ts` — data with a test on it rather than a literal in
 * a build file that only a production build ever evaluates. A route quietly
 * served from a cache is not an error anywhere: it is a screen that is
 * confidently out of date, and nobody reports that as a bug.
 *
 * Nothing that writes is cached and no write is ever queued for later.
 * Replaying a delete or a move against an inventory that changed while the
 * phone was in a pocket is a distributed systems problem, not a caching one,
 * and a client that pretended otherwise would lose somebody's edit quietly.
 * The app says it is offline and refuses to promise more.
 *
 * The caches hold the inside of a house, so they are dropped on sign-out —
 * see `clearCachedResponses`.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Waymark",
        short_name: "Waymark",
        description: "Find anything in the house again.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#11150f",
        theme_color: "#11150f",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Every navigation falls back to the one document, which is what makes
        // `/u/<publicId>` work as far as the login screen with no network.
        navigateFallback: "index.html",
        // Except the API's own paths, which now share this origin and this
        // scope. Without the denylist an installed app would draw itself for
        // `/items` typed into the address bar, which is the client telling
        // the same lie the server's fallback is written to avoid.
        navigateFallbackDenylist: [...navigateFallbackDenylist],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        runtimeCaching: workboxRuntimeCaching,
      },
    }),
  ],
  server: { port: 5173 },
});
