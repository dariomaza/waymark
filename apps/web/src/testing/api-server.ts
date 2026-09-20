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
 * The default `VITE_ARIADNA_API_URL`. Tests build their handlers against it so
 * a change to the default breaks them loudly rather than quietly.
 */
export const API_URL = "http://127.0.0.1:3000";
