import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * The tests drive the real app through the DOM and stub the network at the
 * HTTP boundary with MSW, so nothing in `src` is ever mocked. That is the only
 * way a test can say anything true about the contract with the API: a mocked
 * `fetch` wrapper proves the wrapper was called, not that the request it
 * builds is one the API would have answered.
 *
 * The PWA plugin is deliberately absent here. A service worker is a production
 * concern that jsdom cannot run, and registering one during tests would only
 * add a second source of responses next to MSW.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/testing/setup.ts"],
    restoreMocks: true,
  },
});
