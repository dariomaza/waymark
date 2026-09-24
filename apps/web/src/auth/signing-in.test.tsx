import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { apiServer, API_URL } from "../testing/api-server.js";
import { aSession } from "@waymark/api-client/testing";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";
import { languageStore } from "../app/language.js";
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
    /*
     * The account sheet holds both kinds of credential a person manages
     * (ADR 18, ADR 19), and asks for each list the moment it opens. Declared
     * here because `setup.ts` is emphatic about it: a request no test declared
     * is a test that does not know what it depends on.
     */
    http.get(`${API_URL}/auth/machine-tokens`, () =>
      HttpResponse.json({ machineTokens: [] }),
    ),
    http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
  );
};

const signIn = async (password: string): Promise<void> => {
  await userEvent.type(await screen.findByRole("textbox", { name: /username/i }), "dario");
  await userEvent.type(screen.getByLabelText(/^password$/iu), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("signing in", () => {
  it("asks for credentials when nobody is signed in", async () => {
    renderApp({ route: "/" });

    expect(
      await screen.findByRole("heading", { name: /sign in to waymark/i }),
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

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach waymark/i);
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
      await screen.findByRole("heading", { name: /sign in to waymark/i }),
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

    // The way out lives on the account destination, with everything else that
    // is about the person rather than about the inventory.
    renderApp({ route: "/you" });

    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(
      await screen.findByRole("heading", { name: /sign in to waymark/i }),
    ).toBeVisible();
    await waitFor(() => {
      expect(sessionStore.read()).toBeNull();
    });
  });
});

/**
 * # A password you cannot look at is a password you mistype
 *
 * This form is used one-handed, standing up, on a phone keyboard, and a
 * refused sign-in tells you nothing about WHICH character went wrong. The
 * control that fixes that is not decoration.
 *
 * It is a toggle rather than two buttons, and the state is carried by
 * `aria-pressed` rather than by swapping the word. "Show password" that never
 * says whether the password is currently shown is half a control: somebody
 * who cannot see the input has no way to know which of the two worlds they
 * are in, and pressing it to find out is exactly the thing they cannot do.
 */
describe("looking at what you typed", () => {
  it("hides the password until somebody asks to see it", async () => {
    renderApp({ route: "/" });

    expect(await screen.findByLabelText(/^password$/iu)).toHaveAttribute("type", "password");
  });

  it("shows it when the control is pressed, and hides it again", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/" });

    const password = await screen.findByLabelText(/^password$/iu);
    const reveal = screen.getByRole("button", { name: /show password/i });

    await user.click(reveal);
    expect(password).toHaveAttribute("type", "text");

    await user.click(reveal);
    expect(password).toHaveAttribute("type", "password");
  });

  it("says whether the password is showing, and not merely what pressing it does", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/" });

    const reveal = await screen.findByRole("button", { name: /show password/i });
    expect(reveal).toHaveAttribute("aria-pressed", "false");

    await user.click(reveal);

    expect(reveal).toHaveAttribute("aria-pressed", "true");
  });

  /**
   * The control sits in the tab order right after the field it is about, and
   * answers the keyboard rather than only the thumb.
   */
  it("is reached by Tab from the password, and worked by the keyboard", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/" });

    const password = await screen.findByLabelText(/^password$/iu);
    password.focus();
    await user.tab();

    const reveal = screen.getByRole("button", { name: /show password/i });
    expect(reveal).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(password).toHaveAttribute("type", "text");
  });

  /** A button inside a form that submits it is how a reveal becomes a sign-in. */
  it("does not submit the form", async () => {
    const user = userEvent.setup();
    respondsToLoginWith("never-issued");

    renderApp({ route: "/" });

    await user.click(await screen.findByRole("button", { name: /show password/i }));

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * # The keyboard must not have opinions about a password
 *
 * The username field has said this since it was written. The password field
 * said only `autoComplete`, and got away with it because a masked field is
 * one most mobile keyboards already treat as a special case. The reveal above
 * ends that: the moment the type flips to `text`, the phone's keyboard treats
 * it as prose and capitalises, corrects and spell-checks it.
 *
 * Each of the three is here for its own reason, and the fourth is deliberately
 * NOT turned off — see the last test.
 */
describe("what the keyboard is allowed to do to a password", () => {
  const passwordField = async (): Promise<HTMLElement> =>
    await screen.findByLabelText(/^password$/iu);

  /** A capital first letter nobody typed, on a string where case matters. */
  it("never capitalises the first character", async () => {
    renderApp({ route: "/" });

    expect(await passwordField()).toHaveAttribute("autocapitalize", "none");
  });

  /** A password silently rewritten into a dictionary word is unrecoverable. */
  it("is never autocorrected", async () => {
    renderApp({ route: "/" });

    expect(await passwordField()).toHaveAttribute("autocorrect", "off");
  });

  /**
   * Not cosmetic. A spell checker is a service, and several browsers send the
   * contents of a checked field away to one — which for this field is the
   * password leaving the device to be looked up in a dictionary.
   */
  it("is never spell-checked", async () => {
    renderApp({ route: "/" });

    expect(await passwordField()).toHaveAttribute("spellcheck", "false");
  });

  it("keeps all three once the password is showing, which is when they matter most", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/" });

    await user.click(await screen.findByRole("button", { name: /show password/i }));

    const password = await passwordField();
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveAttribute("autocapitalize", "none");
    expect(password).toHaveAttribute("autocorrect", "off");
    expect(password).toHaveAttribute("spellcheck", "false");
  });

  /**
   * The fourth attribute is not a fourth "off".
   *
   * `autoComplete="current-password"` is what lets the phone's own password
   * manager fill this form, which is the security control this product
   * actually relies on (ADR 6 keeps the token opaque and revocable; nothing
   * here replaces a keychain). Turning it off in the name of tidiness would
   * make people type a long password by hand on a phone, which is how a long
   * password becomes a short one.
   */
  it("still lets the phone's password manager fill it", async () => {
    renderApp({ route: "/" });

    expect(await passwordField()).toHaveAttribute("autocomplete", "current-password");
  });
});

/**
 * The sign-in screen is the one screen somebody sees before they have any
 * chance to change the language, which makes it the screen where the browser's
 * own preference has to be honoured rather than merely offered.
 */
describe("signing in, in Spanish", () => {
  beforeEach(() => {
    languageStore.save("es");
  });

  it("asks for a username and a password in Spanish", async () => {
    renderApp({ route: "/" });

    expect(await screen.findByRole("textbox", { name: "Usuario" })).toBeVisible();
    expect(screen.getByLabelText("Contraseña")).toBeVisible();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  });

  /** The reveal is copy too, and the one control on this screen with a state. */
  it("names the reveal in Spanish", async () => {
    renderApp({ route: "/" });

    expect(
      await screen.findByRole("button", { name: "Mostrar la contraseña" }),
    ).toBeVisible();
  });

  /**
   * "Wrong password" and "cannot reach the server" must stay two different
   * sentences in every language: the first makes you try again more
   * carefully, the second makes you walk towards the router.
   */
  it("tells a refused password apart from an unreachable server", async () => {
    respondsToLoginWith("never-issued");

    renderApp({ route: "/" });
    await userEvent.type(await screen.findByRole("textbox", { name: "Usuario" }), "dario");
    await userEvent.type(screen.getByLabelText("Contraseña"), "guess");
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El usuario o la contraseña no son correctos.",
    );
  });
});
