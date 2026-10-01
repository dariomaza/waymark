import { aSession } from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { renderApp, screen } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";
import { createQueryClient, OFFLINE_RETRY_DELAY_MS } from "./app.js";

const atBox3 = { name: "Unit", params: { id: "box3" } } as const;

/**
 * # The one automatic retry, and the wait before it
 *
 * A request that never left the phone is asked once more before a screen
 * gives up (see `createQueryClient`). On a phone that second attempt waits
 * half a second. In a test that wait is wall-clock time spent inside the one
 * second a `findBy…` allows, so any stall of the test process during it lets
 * the retry and the assertion's deadline fall due together, and the deadline
 * wins. The browser's tests flaked on CI exactly so. The tests keep the retry
 * and drop the wait.
 */
describe("a request that never left the phone", () => {
  const theBoxIsUnreachable = (): number[] => {
    const attempts: number[] = [];
    theApiKnowsTheHouse();
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3`, () => {
        attempts.push(performance.now());

        return HttpResponse.error();
      }),
    );

    return attempts;
  };

  it("is asked once more, and only once, before the screen says it could not reach Waymark", async () => {
    const attempts = theBoxIsUnreachable();

    await renderApp({ session: aSession(), screen: atBox3 });

    expect(await screen.findByText(/could not reach waymark/i)).toBeOnTheScreen();
    expect(attempts).toHaveLength(2);
  });

  it("waits half a second before asking again on a phone", () => {
    expect(createQueryClient().getDefaultOptions().queries?.retryDelay).toBe(
      OFFLINE_RETRY_DELAY_MS,
    );
    expect(OFFLINE_RETRY_DELAY_MS).toBe(500);
  });

  it("is asked again at once in a test, so no assertion races the wait", async () => {
    const attempts = theBoxIsUnreachable();

    await renderApp({ session: aSession(), screen: atBox3 });

    await screen.findByText(/could not reach waymark/i);
    const [first = 0, second = 0] = attempts;
    expect(second - first).toBeLessThan(OFFLINE_RETRY_DELAY_MS);
  });
});
