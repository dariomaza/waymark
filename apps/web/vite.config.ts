import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * # The web client
 *
 * A single page app served from its own origin, talking to the API with a
 * bearer token (ADR 6). It is deliberately not served BY the API: that process
 * answers JSON under `default-src 'none'`, and the origin a browser loads a
 * document from is the thing CORS keys off. Whatever origin this app is served
 * from must appear in the API's `ARIADNA_ALLOWED_ORIGINS`, which is an
 * allowlist and never a reflection.
 *
 * ## What is cached, and what is not
 *
 * The shell — the document, the bundle, the stylesheet, the icons — is
 * precached, so Ariadna opens in the corner of a garage with no signal
 * instead of showing the browser's offline page. Photos already looked at
 * are kept, because a stored file never changes once it has settled and a
 * thumbnail grid is the first screen anybody opens. The forest of storage
 * units is cached network-first, so a live answer always wins and the cached
 * one is only ever the fallback for a dead connection.
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
        name: "Ariadna",
        short_name: "Ariadna",
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
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /^\/photos\/[^/]+(\/thumbnail)?$/u.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "ariadna-photos",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname === "/storage-units",
            handler: "NetworkFirst",
            options: {
              cacheName: "ariadna-tree",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
