import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor } from "../testing/render-app.js";
import { PasskeyCancelled, type PasskeyPlatform } from "./passkey-platform.js";
import { sessionStore } from "./session-store.js";

/**
 * # The other door, from the browser's side
 *
 * jsdom has no `navigator.credentials`, so the platform is injected — the same
 * arrangement the camera has, and for the same reason: what is being stood in
 * for is hardware and a system dialog, while everything the screen DOES around
 * it is the real code, the real router, the real query cache and the real HTTP
 * client answering through MSW.
 *
 * ## The rule these cases exist to hold down
 *
 * ADR 19: a passkey is an ADDITIONAL door. Almost every case here checks the
 * password form is still sitting there afterwards, because the failure this
 * feature could cause is not a broken passkey — it is somebody in a garage
 * with a wet thumb and no way in.
 */

/** A platform that behaves however a case needs it to. */
const aPlatform = (behaviour: Partial<PasskeyPlatform> = {}): PasskeyPlatform => ({
  isAvailable: async () => true,
  register: async () => ({ id: "credential-1", type: "public-key" }),
  assert: async () => ({ id: "credential-1", type: "public-key" }),
  ...behaviour,
});

const answersTheCeremony = (): void => {
  apiServer.use(
    http.post(`${API_URL}/auth/passkey-login/options`, () =>
      HttpResponse.json({ ceremonyId: "c1", options: { challenge: "x" } }),
    ),
  );
};

const answersTheSignIn = (): void => {
  apiServer.use(
    http.post(`${API_URL}/auth/passkey-login`, () =>
      HttpResponse.json({
        token: "a-passkey-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        user: { id: "u1", username: "dario" },
      }),
    ),
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })),
  );
};

const refusesTheSignInWith = (status: number, code: string, details = {}): void => {
  apiServer.use(
    http.post(`${API_URL}/auth/passkey-login`, () =>
      HttpResponse.json(
        { error: { code, message: "the API's own words", details } },
        { status },
      ),
    ),
  );
};

const passkeyButton = async (): Promise<HTMLElement> =>
  await screen.findByRole("button", { name: /use a passkey/i });

describe("the passkey button on the sign-in screen", () => {
  beforeEach(() => {
    answersTheCeremony();
  });

  it("is offered when the device can actually serve one", async () => {
    renderApp({ route: "/", passkeys: aPlatform() });

    expect(await passkeyButton()).toBeVisible();
  });

  /**
   * Not disabled, not explained: absent. A control that cannot work is worse
   * than no control, and the password form is two inches above it.
   */
  it("is not there at all when the device cannot", async () => {
    renderApp({ route: "/", passkeys: aPlatform({ isAvailable: async () => false }) });

    expect(await screen.findByRole("heading", { name: /sign in to waymark/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /use a passkey/i })).toBeNull();
  });

  /**
   * The rule that outranks the rest, asserted directly: the form is complete
   * and present whether or not there is a passkey beside it.
   */
  it("never replaces the password form", async () => {
    renderApp({ route: "/", passkeys: aPlatform() });

    await passkeyButton();

    expect(screen.getByRole("textbox", { name: /username/i })).toBeVisible();
    expect(screen.getByLabelText(/^password$/iu)).toBeVisible();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  it("leaves the password form there even when the device has no authenticator", async () => {
    renderApp({ route: "/", passkeys: aPlatform({ isAvailable: async () => false }) });

    expect(await screen.findByLabelText(/^password$/iu)).toBeVisible();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  /**
   * No conditional mediation and nothing on load: the prompt happens because
   * somebody pressed a button, which is what stops a cut finger turning into a
   * dialog that will not go away.
   */
  it("prompts for nothing until the button is pressed", async () => {
    let prompted = 0;
    renderApp({
      route: "/",
      passkeys: aPlatform({
        assert: async () => {
          prompted += 1;

          return { id: "credential-1", type: "public-key" };
        },
      }),
    });

    await passkeyButton();

    expect(prompted).toBe(0);
  });
});

describe("signing in with a passkey", () => {
  beforeEach(() => {
    answersTheCeremony();
  });

  it("opens the inventory, with no username typed anywhere", async () => {
    answersTheSignIn();
    renderApp({ route: "/", passkeys: aPlatform() });

    await userEvent.click(await passkeyButton());

    expect(await screen.findByRole("heading", { name: /your inventory/i })).toBeVisible();
  });

  /**
   * ADR 6: one mechanism. The session a passkey opens is stored exactly where
   * a password's is, which is why nothing above this changed.
   */
  it("keeps the session it was handed, exactly as a password's is kept", async () => {
    answersTheSignIn();
    renderApp({ route: "/", passkeys: aPlatform() });

    await userEvent.click(await passkeyButton());

    await waitFor(() => {
      expect(sessionStore.read()?.token).toBe("a-passkey-token");
    });
  });

  it("sends the ceremony back with what the authenticator signed", async () => {
    let body: unknown;
    apiServer.use(
      http.post(`${API_URL}/auth/passkey-login`, async ({ request }) => {
        body = await request.json();

        return HttpResponse.json({
          token: "a-passkey-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          user: { id: "u1", username: "dario" },
        });
      }),
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    await userEvent.click(await passkeyButton());

    await waitFor(() => {
      expect(body).toEqual({
        ceremonyId: "c1",
        credential: { id: "credential-1", type: "public-key" },
      });
    });
  });
});

/**
 * # When it does not work, which is the half that matters
 *
 * A wet thumb, a cut finger, a phone that just rebooted, a change of mind.
 * Every one of these has to land somewhere calm, with the password form
 * untouched and nothing re-prompting.
 */
describe("a passkey that did not work", () => {
  beforeEach(() => {
    answersTheCeremony();
  });

  it("says so quietly when somebody dismisses the prompt, and does not call it an error", async () => {
    renderApp({
      route: "/",
      passkeys: aPlatform({
        assert: async () => {
          throw new PasskeyCancelled();
        },
      }),
    });

    await userEvent.click(await passkeyButton());

    expect(await screen.findByRole("status")).toHaveTextContent(
      /no passkey was used/i,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves a working password form behind after a dismissal", async () => {
    renderApp({
      route: "/",
      passkeys: aPlatform({
        assert: async () => {
          throw new PasskeyCancelled();
        },
      }),
    });

    await userEvent.click(await passkeyButton());
    await screen.findByRole("status");

    expect(screen.getByLabelText(/^password$/iu)).toBeEnabled();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  /** Once, and only because a person asked. */
  it("does not prompt again by itself after a dismissal", async () => {
    let prompted = 0;
    renderApp({
      route: "/",
      passkeys: aPlatform({
        assert: async () => {
          prompted += 1;
          throw new PasskeyCancelled();
        },
      }),
    });

    await userEvent.click(await passkeyButton());
    await screen.findByRole("status");

    expect(prompted).toBe(1);
  });

  it("tells somebody whose prompt timed out to try again", async () => {
    refusesTheSignInWith(422, "PASSKEY_CEREMONY_EXPIRED");
    renderApp({ route: "/", passkeys: aPlatform() });

    await userEvent.click(await passkeyButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
  });

  /**
   * The one refusal with something to DO about it, and the device has to be
   * named or "remove it" means nothing.
   */
  it("names the device that may have been copied, and says the password still works", async () => {
    refusesTheSignInWith(401, "CLONED_PASSKEY", { label: "Pixel 8" });
    renderApp({ route: "/", passkeys: aPlatform() });

    await userEvent.click(await passkeyButton());

    const said = await screen.findByRole("alert");
    expect(said).toHaveTextContent(/Pixel 8/);
    expect(said).toHaveTextContent(/password still works/i);
  });

  it("sends nobody to a password screen they were already on", async () => {
    refusesTheSignInWith(401, "INVALID_PASSKEY");
    renderApp({ route: "/", passkeys: aPlatform() });

    await userEvent.click(await passkeyButton());
    await screen.findByRole("alert");

    expect(screen.getByRole("button", { name: /sign in/i })).toBeVisible();
    expect(sessionStore.read()).toBeNull();
  });

  it("says the app could not be reached, rather than blaming the device", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkey-login/options`, () => HttpResponse.error()),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    await userEvent.click(await passkeyButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach waymark/i,
    );
  });
});
