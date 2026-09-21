import { aSession, aStorageUnit, aTree } from "@ariadna/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";

const theHouse = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({
        tree: [aTree(aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" }))],
      }),
    ),
  );
};

/**
 * Where the app lands: the camera, not a menu. Scanning a box is the reason
 * the product exists, so it is the first tab and it is what a signed-in phone
 * opens on.
 */
const theCamera = /scan a label/i;

describe("signing in", () => {
  it("takes a username and a password and lands on the camera", async () => {
    const sent: unknown[] = [];
    theHouse();
    apiServer.use(
      http.post(`${API_URL}/auth/login`, async ({ request }) => {
        sent.push(await request.json());

        return HttpResponse.json({
          token: "a-fresh-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          user: { id: "u1", username: "dario" },
        });
      }),
    );

    await renderApp({ screen: { name: "Tabs" } });

    await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(theCamera)).toBeOnTheScreen();
    expect(sent).toEqual([{ username: "dario", password: "correct horse" }]);
  });

  it("tells a wrong password apart from a phone with no signal", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "invalid username or password" } },
          { status: 401 },
        ),
      ),
    );

    await renderApp({ screen: { name: "Tabs" } });

    await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
    await fireEvent.changeText(screen.getByLabelText("Password"), "guess");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/that username or password is wrong/i)).toBeOnTheScreen();
  });

  it("says the connection is the problem when nothing answered", async () => {
    apiServer.use(http.post(`${API_URL}/auth/login`, () => HttpResponse.error()));

    await renderApp({ screen: { name: "Tabs" } });

    await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/could not reach ariadna/i)).toBeOnTheScreen();
  });

  it("opens straight into the app when the keystore already holds a session", async () => {
    theHouse();

    await renderApp({ screen: { name: "Tabs" }, session: aSession() });

    expect(await screen.findByText(theCamera)).toBeOnTheScreen();
  });

  /**
   * Sessions last 30 days and slide (ADR 6). One that did not slide far enough
   * is not a session, and the check is on the way OUT rather than on a timer —
   * so a phone left in a pocket for a month does not draw an inventory it can
   * no longer load.
   */
  it("asks for the password again when the stored session has expired", async () => {
    theHouse();

    await renderApp({
      screen: { name: "Tabs" },
      session: aSession({ expiresAt: "2020-01-01T00:00:00.000Z" }),
    });

    expect(await screen.findByLabelText("Username")).toBeOnTheScreen();
    expect(screen.queryByText(theCamera)).not.toBeOnTheScreen();
  });

  /**
   * A token is a row on the server and can be revoked at any moment (ADR 6).
   * When the API refuses the one this app presented, the session is over —
   * which is a trip back to the login screen rather than a screen full of
   * failures.
   */
  it("ends the session when the API refuses the token it was given", async () => {
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_SESSION", message: "session has expired" } },
          { status: 401 },
        ),
      ),
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_SESSION", message: "session has expired" } },
          { status: 401 },
        ),
      ),
    );

    await renderApp({ screen: { name: "Tabs" }, session: aSession() });

    await waitFor(async () => {
      expect(await screen.findByLabelText("Username")).toBeOnTheScreen();
    });
  });
});
