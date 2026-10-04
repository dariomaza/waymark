import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession } from "@waymark/api-client/testing";

import { sessionStore } from "./session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";

/**
 * # Choosing your password, the first time (ADR 26, amended)
 *
 * An account made or reset by an administrator holds a temporary password.
 * While `mustChangePassword` is true the API answers every route but
 * `/auth/me`, logout and `POST /auth/password` with 403
 * `PASSWORD_CHANGE_REQUIRED`, so the app shows ONE screen and nothing else:
 * a new password, one primary action, and a way to sign out.
 */

const me = (mustChangePassword: boolean) =>
  HttpResponse.json({
    user: { id: "u1", username: "child", role: "user", mustChangePassword },
  });

const restricted = () =>
  HttpResponse.json(
    { error: { code: "PASSWORD_CHANGE_REQUIRED", message: "change it first" } },
    { status: 403 },
  );

/** What `/auth/me` answers, flipping to unflagged once a password is chosen. */
let flagged: boolean;

const theAccountIsFlagged = (): void => {
  flagged = true;
  apiServer.use(http.get(`${API_URL}/auth/me`, () => me(flagged)));
};

const theInventoryAnswers = (): void => {
  apiServer.use(
    http.get(`${API_URL}/storage-units`, () =>
      flagged ? restricted() : HttpResponse.json({ tree: [] }),
    ),
  );
};

const choosing = (): Promise<HTMLElement> =>
  screen.findByRole("heading", { name: "Choose your password" });

describe("choosing your password, the first time", () => {
  beforeEach(() => {
    sessionStore.save(aSession({ mustChangePassword: true }));
  });

  /**
   * No `/storage-units` handler: `setup.ts` fails a test that asks for
   * anything undeclared, so this also proves nothing else was requested.
   */
  it("is the only screen a person with a temporary password sees", async () => {
    theAccountIsFlagged();

    renderApp({ route: "/" });

    expect(await choosing()).toBeVisible();
    expect(screen.getByLabelText("New password")).toBeVisible();
    expect(screen.getByText("At least 12 characters.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show password" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /your inventory/i })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("is not shown to a person whose password is their own", async () => {
    flagged = false;
    apiServer.use(http.get(`${API_URL}/auth/me`, () => me(false)));
    theInventoryAnswers();

    renderApp({ route: "/" });

    expect(await screen.findByRole("heading", { name: /your inventory/i })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Choose your password" })).toBeNull();
  });

  it("sends only the new password, and then the app carries on and loads", async () => {
    theAccountIsFlagged();
    theInventoryAnswers();
    let body: unknown;
    apiServer.use(
      http.post(`${API_URL}/auth/password`, async ({ request }) => {
        body = await request.json();
        flagged = false;
        return me(false);
      }),
    );

    renderApp({ route: "/" });
    await choosing();
    await userEvent.type(screen.getByLabelText("New password"), "a-password-of-my-own");
    await userEvent.click(screen.getByRole("button", { name: "Save my password" }));

    expect(await screen.findByRole("heading", { name: /your inventory/i })).toBeVisible();
    expect(body).toEqual({ password: "a-password-of-my-own" });
    expect(screen.queryByRole("heading", { name: "Choose your password" })).toBeNull();
    expect(sessionStore.read()?.token).toBe("a-live-token");
  });

  it("says why a password was refused, and stays", async () => {
    theAccountIsFlagged();
    apiServer.use(
      http.post(`${API_URL}/auth/password`, () =>
        HttpResponse.json(
          { error: { code: "PASSWORD_UNCHANGED", message: "same" } },
          { status: 422 },
        ),
      ),
    );

    renderApp({ route: "/" });
    await choosing();
    await userEvent.type(screen.getByLabelText("New password"), "wxmc-hepa-rtkd-ufbn");
    await userEvent.click(screen.getByRole("button", { name: "Save my password" }));

    expect(
      await screen.findByText("Choose a password different from the one you have now."),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Choose your password" })).toBeVisible();
  });

  it("lets the person sign out instead", async () => {
    theAccountIsFlagged();
    apiServer.use(http.post(`${API_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 })));

    renderApp({ route: "/" });
    await choosing();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: /sign in to waymark/i })).toBeVisible();
    expect(sessionStore.read()).toBeNull();
  });

  /**
   * The flag set while the app was open: the next request is refused, and the
   * app goes to this screen. It is NOT the end of the session — the person is
   * still signed in, and the screen must not say otherwise.
   */
  it("goes to this screen when a request answers that a password must be chosen", async () => {
    sessionStore.save(aSession());
    flagged = false;
    let asked = 0;
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () => {
        asked += 1;
        return me(asked > 1);
      }),
      http.get(`${API_URL}/storage-units`, () => restricted()),
    );

    renderApp({ route: "/" });

    expect(await choosing()).toBeVisible();
    expect(sessionStore.read()?.token).toBe("a-live-token");
    expect(screen.queryByText(/session has ended/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /sign in to waymark/i })).toBeNull();
  });

  it("is where signing in with a temporary password leads", async () => {
    sessionStore.clear();
    theAccountIsFlagged();
    apiServer.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json(aSession({ token: "a-fresh-token", mustChangePassword: true })),
      ),
    );

    renderApp({ route: "/" });
    await userEvent.type(await screen.findByRole("textbox", { name: /username/i }), "child");
    await userEvent.type(screen.getByLabelText(/^password$/iu), "wxmc-hepa-rtkd-ufbn");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(async () => {
      expect(await choosing()).toBeVisible();
    });
  });
});
