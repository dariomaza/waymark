import { http, HttpResponse } from "msw";
import { aSession } from "@waymark/api-client/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";
import {
  PasskeyCancelled,
  PasskeyCeremonyFailed,
  type PasskeyPlatform,
} from "./passkey-platform.js";
import { sessionStore } from "./session-store.js";

/**
 * # The devices on your account, from the account sheet
 *
 * Beside the machine tokens, and deliberately a different shape: a machine
 * token hands back a secret once and never again, and a passkey has no secret
 * to hand back at all — the private half never leaves the authenticator. So
 * there is no warning banner here, no copy button and no "I have stored it",
 * and these cases say so.
 */

const aPlatform = (behaviour: Partial<PasskeyPlatform> = {}): PasskeyPlatform => ({
  isAvailable: async () => true,
  register: async () => ({ id: "credential-1", type: "public-key" }),
  assert: async () => ({ id: "credential-1", type: "public-key" }),
  ...behaviour,
});

const aPasskey = (overrides: Record<string, unknown> = {}) => ({
  id: "pk1",
  label: "Pixel 8",
  createdAt: "2026-04-01T10:00:00.000Z",
  lastUsedAt: null,
  ...overrides,
});

const signedIn = (): void => {
  sessionStore.save(aSession({ token: "a-live-token" }));
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [] })),
    http.get(`${API_URL}/auth/machine-tokens`, () =>
      HttpResponse.json({ machineTokens: [] }),
    ),
  );
};

const listing = (...passkeys: readonly ReturnType<typeof aPasskey>[]): void => {
  apiServer.use(http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys })));
};

const openTheAccountSheet = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole("button", { name: /your account/i }));
};

const panel = async (): Promise<HTMLElement> => {
  const heading = await screen.findByRole("heading", { name: /^passkeys$/i });

  return heading.closest("section") as HTMLElement;
};

describe("the passkeys on your account", () => {
  beforeEach(() => {
    signedIn();
  });

  it("says there are none before anything is registered", async () => {
    listing();
    renderApp({ route: "/", passkeys: aPlatform() });

    await openTheAccountSheet();

    expect(within(await panel()).getByText(/no passkeys yet/i)).toBeVisible();
  });

  it("names each device and when it was last used", async () => {
    listing(
      aPasskey({ label: "Pixel 8", lastUsedAt: "2026-04-02T10:00:00.000Z" }),
      aPasskey({ id: "pk2", label: "Work laptop" }),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    await openTheAccountSheet();
    const section = await panel();

    expect(within(section).getByText("Pixel 8")).toBeVisible();
    expect(within(section).getByText("Work laptop")).toBeVisible();
    expect(within(section).getByText(/last used/i)).toBeVisible();
    expect(within(section).getByText(/never used/i)).toBeVisible();
  });

  /**
   * There is nothing to copy and nothing to warn about, because there is no
   * secret — which is the whole difference between this panel and the machine
   * tokens directly under it.
   */
  it("never shows a secret, because a passkey does not have one", async () => {
    listing(aPasskey());
    renderApp({ route: "/", passkeys: aPlatform() });

    await openTheAccountSheet();
    const section = await panel();

    expect(within(section).queryByRole("button", { name: /copy/i })).toBeNull();
    expect(within(section).queryByText(/only time you will see this/i)).toBeNull();
  });
});

describe("adding a device", () => {
  beforeEach(() => {
    signedIn();
    listing();
  });

  const answersTheCeremony = (): void => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, () =>
        HttpResponse.json({ ceremonyId: "c1", options: { challenge: "x" } }),
      ),
    );
  };

  const addDevice = async (name = "Pixel 8"): Promise<void> => {
    await openTheAccountSheet();
    const section = await panel();

    await userEvent.click(
      within(section).getByRole("button", { name: /add this device/i }),
    );
    await userEvent.type(
      within(section).getByRole("textbox", { name: /what is this device/i }),
      name,
    );
    await userEvent.click(within(section).getByRole("button", { name: /add it/i }));
  };

  it("asks for a ceremony, prompts the device, and sends back the name", async () => {
    let body: unknown;
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, () =>
        HttpResponse.json({ ceremonyId: "c1", options: { challenge: "x" } }),
      ),
      http.post(`${API_URL}/auth/passkeys`, async ({ request }) => {
        body = await request.json();

        return HttpResponse.json({ passkey: aPasskey() }, { status: 201 });
      }),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    await addDevice("Pixel 8");

    await waitFor(() => {
      expect(body).toEqual({
        ceremonyId: "c1",
        label: "Pixel 8",
        credential: { id: "credential-1", type: "public-key" },
      });
    });
  });

  it("shows the device in the list once it is added", async () => {
    let added = false;
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, () =>
        HttpResponse.json({ ceremonyId: "c1", options: { challenge: "x" } }),
      ),
      http.post(`${API_URL}/auth/passkeys`, () => {
        added = true;

        return HttpResponse.json({ passkey: aPasskey() }, { status: 201 });
      }),
      http.get(`${API_URL}/auth/passkeys`, () =>
        HttpResponse.json({ passkeys: added ? [aPasskey()] : [] }),
      ),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    await addDevice();

    expect(await within(await panel()).findByText("Pixel 8")).toBeVisible();
  });

  /**
   * The refusal ADR 19 is really about: a session a passkey opened may not
   * mint another one, and the sentence has to say what to do rather than
   * merely refuse.
   */
  it("says to sign in with a password when the session was opened by a passkey", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, () =>
        HttpResponse.json(
          {
            error: {
              code: "PASSKEY_NEEDS_A_PASSWORD",
              message: "adding a passkey needs your password",
            },
          },
          { status: 403 },
        ),
      ),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    await addDevice();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /adding a passkey needs your password/i,
    );
  });

  it("says nothing alarming when somebody dismisses the prompt", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/passkeys/options`, () =>
        HttpResponse.json({ ceremonyId: "c1", options: { challenge: "x" } }),
      ),
    );
    renderApp({
      route: "/",
      passkeys: aPlatform({
        register: async () => {
          throw new PasskeyCancelled();
        },
      }),
    });

    await addDevice();

    expect(await screen.findByRole("status")).toHaveTextContent(/no passkey was used/i);
  });

  /**
   * # The false sentence, and what replaces it
   *
   * This is the failure the owner actually met: the API answered the options
   * request 200, `startRegistration` threw inside the browser, the finishing
   * request was never made, and the panel said "Waymark had a problem
   * answering". Every word of that was about a server that had already
   * answered.
   */
  it("blames the device rather than Waymark when the ceremony failed here", async () => {
    answersTheCeremony();
    renderApp({
      route: "/",
      passkeys: aPlatform({
        register: async () => {
          throw new PasskeyCeremonyFailed(
            new DOMException("the authenticator gave up", "UnknownError"),
          );
        },
      }),
    });

    await addDevice();

    const said = await screen.findByRole("alert");
    expect(said).not.toHaveTextContent(/waymark had a problem answering/i);
    expect(said).toHaveTextContent(/your device/i);
    expect(said).toHaveTextContent(/password still works/i);
    expect(said).toHaveTextContent(/UnknownError/);
  });

  /** A device that already holds one has not failed at all, and is told so. */
  it("says this device already holds one when the authenticator says so", async () => {
    answersTheCeremony();
    renderApp({
      route: "/",
      passkeys: aPlatform({
        register: async () => {
          throw new PasskeyCeremonyFailed(
            new DOMException("previously registered", "InvalidStateError"),
          );
        },
      }),
    });

    await addDevice();

    const said = await screen.findByRole("alert");
    expect(said).toHaveTextContent(/already holds a passkey/i);
    expect(said).toHaveTextContent(/InvalidStateError/);
  });

  /**
   * Only the button goes. A laptop with no reader is exactly where somebody
   * sits down to remove the passkey on the phone they have just lost.
   */
  it("offers no way to add one on a device that cannot, and still lists them", async () => {
    listing(aPasskey());
    renderApp({ route: "/", passkeys: aPlatform({ isAvailable: async () => false }) });

    await openTheAccountSheet();
    const section = await panel();

    expect(within(section).queryByRole("button", { name: /add this device/i })).toBeNull();
    expect(within(section).getByText("Pixel 8")).toBeVisible();
  });
});

describe("removing one", () => {
  beforeEach(() => {
    signedIn();
  });

  const askToRemove = async (): Promise<HTMLElement> => {
    await openTheAccountSheet();
    const section = await panel();

    await userEvent.click(within(section).getByRole("button", { name: /^remove$/i }));

    return section;
  };

  it("asks first, and says the password still works", async () => {
    listing(aPasskey());
    renderApp({ route: "/", passkeys: aPlatform() });

    const section = await askToRemove();

    expect(within(section).getByText(/cannot lock you out/i)).toBeVisible();
  });

  it("names the device in the question", async () => {
    listing(aPasskey({ label: "Work laptop" }));
    renderApp({ route: "/", passkeys: aPlatform() });

    const section = await askToRemove();

    expect(within(section).getByText(/remove work laptop\?/i)).toBeVisible();
  });

  it("removes it once confirmed", async () => {
    const removed: string[] = [];
    listing(aPasskey());
    apiServer.use(
      http.delete(`${API_URL}/auth/passkeys/:id`, ({ params }) => {
        removed.push(String(params["id"]));

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    const section = await askToRemove();
    await userEvent.click(within(section).getByRole("button", { name: /remove it/i }));

    await waitFor(() => {
      expect(removed).toEqual(["pk1"]);
    });
  });

  it("changes nothing when the question is cancelled", async () => {
    const removed: string[] = [];
    listing(aPasskey());
    apiServer.use(
      http.delete(`${API_URL}/auth/passkeys/:id`, ({ params }) => {
        removed.push(String(params["id"]));

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    const section = await askToRemove();
    await userEvent.click(within(section).getByRole("button", { name: /cancel/i }));

    expect(removed).toEqual([]);
    expect(within(section).getByText("Pixel 8")).toBeVisible();
  });

  /**
   * ADR 19: there is no "you must keep one" rule, because there is no state in
   * which a passkey is the only way in. The last one removes like any other.
   */
  it("lets somebody remove the last one they have", async () => {
    let gone = false;
    apiServer.use(
      http.get(`${API_URL}/auth/passkeys`, () =>
        HttpResponse.json({ passkeys: gone ? [] : [aPasskey()] }),
      ),
      http.delete(`${API_URL}/auth/passkeys/:id`, () => {
        gone = true;

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    const section = await askToRemove();
    await userEvent.click(within(section).getByRole("button", { name: /remove it/i }));

    expect(await within(section).findByText(/no passkeys yet/i)).toBeVisible();
  });

  it("says so when the device was already gone", async () => {
    listing(aPasskey());
    apiServer.use(
      http.delete(`${API_URL}/auth/passkeys/:id`, () =>
        HttpResponse.json(
          { error: { code: "PASSKEY_NOT_FOUND", message: "no such passkey" } },
          { status: 404 },
        ),
      ),
    );
    renderApp({ route: "/", passkeys: aPlatform() });

    const section = await askToRemove();
    await userEvent.click(within(section).getByRole("button", { name: /remove it/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already have been removed/i);
  });
});
