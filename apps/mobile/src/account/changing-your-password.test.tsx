import { aSession } from "@waymark/api-client/testing";

import { LANGUAGE_KEY } from "../app/language.js";
import { inMemorySecureStorage, type SecureStorage } from "../auth/secure-storage.js";
import { SESSION_KEY } from "../auth/session-store.js";
import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, within } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # Changing your password, from the account screen (ADR 26, amended)
 *
 * A group of its own, between Preferences and Security, as on the browser.
 * Its title line holds the way in; the form asks for the current password,
 * then the new one. The API keeps this session and ends the others, and a
 * wrong current password is said as exactly that — it signs nobody out.
 */

const theCamera = /scan a label/i;

const signedIn = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({
        user: { id: "u1", username: "dario", role: "user", mustChangePassword: false },
      }),
    ),
  );
};

/** A group, found by its title, and nothing outside it. */
const groupTitled = (title: string): ReturnType<typeof within> => {
  const header = screen.getByRole("header", { name: title });
  const group = header.parent?.parent ?? null;
  if (group === null) {
    throw new Error(`"${title}" is not the title of a group`);
  }

  return within(group);
};

const openPassword = async (storage?: SecureStorage): Promise<ReturnType<typeof within>> => {
  await renderApp(storage === undefined ? { session: aSession() } : { storage });
  await screen.findByText(theCamera);
  await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));
  await screen.findByRole("header", { name: "Password" });

  return groupTitled("Password");
};

const fillIn = async (
  group: ReturnType<typeof within>,
  current: string,
  next: string,
): Promise<void> => {
  await fireEvent.press(group.getByRole("button", { name: "Change password" }));
  await fireEvent.changeText(group.getByLabelText("Current password"), current);
  await fireEvent.changeText(group.getByLabelText("New password"), next);
  await fireEvent.press(group.getByRole("button", { name: "Change it" }));
};

describe("changing your password, from the account screen", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
    signedIn();
  });

  it("is a group between Preferences and Security", async () => {
    await openPassword();

    const names = screen.getAllByRole("header").map((header) => header.props.children as unknown);
    expect(names.indexOf("Password")).toBe(names.indexOf("Preferences") + 1);
  });

  it("asks for the current password first, then the new one", async () => {
    const group = await openPassword();

    expect(group.queryByLabelText("Current password")).toBeNull();
    await fireEvent.press(group.getByRole("button", { name: "Change password" }));

    const fields = group.getAllByLabelText(/^(current|new) password$/i);
    expect(fields.map((field) => field.props.accessibilityLabel as unknown)).toEqual([
      "Current password",
      "New password",
    ]);
    expect(group.getByText("At least 12 characters.")).toBeOnTheScreen();
  });

  it("sends the current password with the new one, and says it is done", async () => {
    let body: unknown;
    apiServer.use(
      http.post(`${API_URL}/auth/password`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          user: { id: "u1", username: "dario", role: "user", mustChangePassword: false },
        });
      }),
    );

    const group = await openPassword();
    await fillIn(group, "my-old-password", "my-brand-new-password");

    expect(await group.findByText(/your password is changed/i)).toBeOnTheScreen();
    expect(body).toEqual({ password: "my-brand-new-password", currentPassword: "my-old-password" });
    expect(group.queryByLabelText("Current password")).toBeNull();
  });

  it("says a wrong current password is wrong, and keeps the person signed in", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/password`, () =>
        HttpResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "wrong" } }, { status: 401 }),
      ),
    );
    const storage = inMemorySecureStorage({
      [SESSION_KEY]: JSON.stringify(aSession()),
      [LANGUAGE_KEY]: "en",
    });

    const group = await openPassword(storage);
    await fillIn(group, "not-my-password", "my-brand-new-password");

    expect(
      await group.findByText("That is not your current password. Try typing it again."),
    ).toBeOnTheScreen();
    expect(await storage.read(SESSION_KEY)).toContain("a-live-token");
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
