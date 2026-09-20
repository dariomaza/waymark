import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiServer, API_URL } from "../testing/api-server.js";
import { aSession } from "@ariadna/api-client/testing";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";
import { sessionStore } from "./session-store.js";

const respondsToLoginWith = (token: string): void => {
  apiServer.use(
    http.post(`${API_URL}/auth/login`, async ({ request }) => {
      const body = (await request.json()) as { username: string; password: string };
      if (body.password !== "correct horse") {
        return HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "invalid credentials" } },
          { status: 401 },
        );
      }

      return HttpResponse.json({
        token,
        expiresAt: "2099-01-01T00:00:00.000Z",
        user: { id: "u1", username: body.username },
      });
    }),
  );
};

const knowsTheSession = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
  );
};

const signIn = async (password: string): Promise<void> => {
  await userEvent.type(await screen.findByRole("textbox", { name: /username/i }), "dario");
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("signing in", () => {
  it("asks for credentials when nobody is signed in", async () => {
    renderApp({ route: "/" });

    expect(
      await screen.findByRole("heading", { name: /sign in to ariadna/i }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: /username/i })).toBeVisible();
  });

  it("opens the inventory once the password is accepted", async () => {
    respondsToLoginWith("a-fresh-token");
    knowsTheSession();
    apiServer.use(http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })));

    renderApp({ route: "/" });
    await signIn("correct horse");

    expect(await screen.findByRole("heading", { name: /your inventory/i })).toBeVisible();
  });

  it("keeps the person on the form and says what was wrong when the password is refused", async () => {
    respondsToLoginWith("never-issued");

    renderApp({ route: "/" });
    await signIn("guess");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /username or password is wrong/i,
    );
    expect(screen.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  it("says how long to wait when the login rate limiter refuses", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json(
          {
            error: {
              code: "TOO_MANY_LOGIN_ATTEMPTS",
              message: "too many login attempts; retry in 540 seconds",
            },
          },
          { status: 429 },
        ),
      ),
    );

    renderApp({ route: "/" });
    await signIn("correct horse");

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("says the app cannot be reached, rather than blaming the password", async () => {
    apiServer.use(http.post(`${API_URL}/auth/login`, () => HttpResponse.error()));

    renderApp({ route: "/" });
    await signIn("correct horse");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach ariadna/i);
  });
});

describe("a session that is over", () => {
  it("is not presented at all once its expiry has passed", () => {
    sessionStore.save(aSession({ token: "stale", expiresAt: "2020-01-01T00:00:00.000Z" }));

    expect(sessionStore.read()).toBeNull();
  });

  it("sends the user back to the login screen when the API refuses the stored token", async () => {
    sessionStore.save(aSession({ token: "revoked" }));
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_SESSION", message: "session has expired" } },
          { status: 401 },
        ),
      ),
    );

    renderApp({ route: "/" });

    expect(
      await screen.findByRole("heading", { name: /sign in to ariadna/i }),
    ).toBeVisible();
    expect(sessionStore.read()).toBeNull();
  });

  it("is ended deliberately by signing out", async () => {
    sessionStore.save(aSession({ token: "live" }));
    knowsTheSession();
    apiServer.use(
      http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })),
      http.post(`${API_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    renderApp({ route: "/" });

    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(
      await screen.findByRole("heading", { name: /sign in to ariadna/i }),
    ).toBeVisible();
    await waitFor(() => {
      expect(sessionStore.read()).toBeNull();
    });
  });
});
