import { setupServer } from "msw/node";

/**
 * The network is stubbed at the HTTP boundary and nowhere else.
 *
 * Nothing in `src` is ever mocked: the tests run the real client, the real
 * query cache and the real components, and MSW answers the requests the way
 * `apps/api` would. A test that replaced the app's own fetch wrapper would
 * prove the wrapper was called and say nothing at all about the contract with
 * the API — which is the only thing worth pinning here.
 *
 * Handlers are declared per test with `apiServer.use(...)`, so what a test
 * depends on is visible in the test.
 */
export const apiServer = setupServer();

/**
 * The default `VITE_WAYMARK_API_URL`, which is now the empty string: the API
 * is on this app's own origin, so every request it makes is a relative one.
 * Tests build their handlers against it so a change to the default breaks
 * them loudly rather than quietly.
 *
 * MSW resolves a relative handler path against the document's origin, which
 * is exactly what the browser does with the request — so the tests exercise
 * the same-origin configuration the deployment runs, rather than a
 * cross-origin one nothing uses any more.
 */
export const API_URL = "";
