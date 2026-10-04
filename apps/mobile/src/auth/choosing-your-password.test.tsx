import { aSession } from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # Choosing your password, the first time (ADR 26, amended)
 *
 * An account made or reset by an administrator holds a temporary password.
 * While `mustChangePassword` is true the API answers every route but
 * `/auth/me`, logout and `POST /auth/password` with 403
 * `PASSWORD_CHANGE_REQUIRED`, so the phone shows ONE screen and nothing else:
 * a new password, one primary action, and a way to sign out. The browser
 * draws the same screen.
 */

/** What `/auth/me` answers, flipping to unflagged once a password is chosen. */
let flagged: boolean;

const me = (): Response =>
  HttpResponse.json({
    user: { id: "u1", username: "dario", role: "user", mustChangePassword: flagged },
  });

const restricted = (): Response =>
  HttpResponse.json(
    { error: { code: "PASSWORD_CHANGE_REQUIRED", message: "change it first" } },
    { status: 403 },
  );

const theAccountIs = (isFlagged: boolean): void => {
  flagged = isFlagged;
  apiServer.use(http.get(`${API_URL}/auth/me`, me));
};

const theCamera = /scan a label/i;

const choosing = async (): Promise<unknown> =>
  await screen.findByRole("header", { name: "Choose your password" });

describe("choosing your password, the first time", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  it("is the only screen a person with a temporary password sees", async () => {
    theAccountIs(true);

    await renderApp({ session: aSession({ mustChangePassword: true }) });

    await choosing();
    expect(screen.getByText(/signed in with a temporary password/i)).toBeOnTheScreen();
    expect(screen.getByLabelText("New password")).toBeOnTheScreen();
    expect(screen.getByText("At least 12 characters.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save my password" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeOnTheScreen();
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    expect(screen.queryByText(theCamera)).toBeNull();
    expect(screen.queryByRole("button", { name: "You, signed in as dario" })).toBeNull();
  });

  it("is not shown to a person whose password is their own", async () => {
    theAccountIs(false);

    await renderApp({ session: aSession() });

    expect(await screen.findByText(theCamera)).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Choose your password" })).toBeNull();
  });

  it("sends only the new password, and then the app carries on", async () => {
    theAccountIs(true);
    let body: unknown;
    apiServer.use(
      http.post(`${API_URL}/auth/password`, async ({ request }) => {
        body = await request.json();
        flagged = false;
        return me();
      }),
    );

    await renderApp({ session: aSession({ mustChangePassword: true }) });
    await choosing();
    await fireEvent.changeText(screen.getByLabelText("New password"), "a-password-of-my-own");
    await fireEvent.press(screen.getByRole("button", { name: "Save my password" }));

    expect(await screen.findByText(theCamera)).toBeOnTheScreen();
    expect(body).toEqual({ password: "a-password-of-my-own" });
    expect(screen.queryByRole("header", { name: "Choose your password" })).toBeNull();
  });

  it("says why a password was refused, and stays", async () => {
    theAccountIs(true);
    apiServer.use(
      http.post(`${API_URL}/auth/password`, () =>
        HttpResponse.json(
          { error: { code: "PASSWORD_TOO_SHORT", message: "short", details: { minimumLength: 12 } } },
          { status: 422 },
        ),
      ),
    );

    await renderApp({ session: aSession({ mustChangePassword: true }) });
    await choosing();
    await fireEvent.changeText(screen.getByLabelText("New password"), "short");
    await fireEvent.press(screen.getByRole("button", { name: "Save my password" }));

    expect(await screen.findByText("The password needs at least 12 characters.")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Choose your password" })).toBeOnTheScreen();
  });

  it("lets the person sign out instead", async () => {
    theAccountIs(true);
    apiServer.use(http.post(`${API_URL}/auth/logout`, () => HttpResponse.json({})));

    await renderApp({ session: aSession({ mustChangePassword: true }) });
    await choosing();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeOnTheScreen();
  });

  /**
   * An administrator resets the password while the app is open. The next
   * request is refused — which is NOT the end of the session: the phone asks
   * `/auth/me` again and draws this screen, still signed in.
   */
  it("goes to this screen when a request answers that a password must be chosen", async () => {
    theAccountIs(false);
    apiServer.use(
      http.get(`${API_URL}/auth/machine-tokens`, () => {
        flagged = true;
        return restricted();
      }),
    );

    await renderApp({ session: aSession() });
    await screen.findByText(theCamera);
    await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));

    await choosing();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.queryByText(/session ended/i)).toBeNull();
  });

  it("is where signing in with a temporary password leads", async () => {
    theAccountIs(true);
    apiServer.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json(aSession({ token: "a-fresh-token", mustChangePassword: true })),
      ),
    );

    await renderApp();
    await fireEvent.changeText(await screen.findByLabelText("Username"), "dario");
    await fireEvent.changeText(screen.getByLabelText("Password"), "wxmc-hepa-rtkd-ufbn");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    await choosing();
    expect(screen.queryByText(theCamera)).toBeNull();
  });
});
