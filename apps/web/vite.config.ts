import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * # The web client
 *
 * A single page app served from its own origin, talking to the API with a
 * bearer token (ADR 6). It is deliberately not served BY the API: that process
 * answers JSON under `default-src 'none'`, and the origin a browser loads a
 * document from is the thing CORS keys off. Whatever origin this app is served
 * from must appear in the API's `ARIADNA_ALLOWED_ORIGINS`, which is an
 * allowlist and never a reflection.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
