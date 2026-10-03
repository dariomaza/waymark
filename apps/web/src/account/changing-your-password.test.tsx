import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession } from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

/**
 * # Changing your password, from the account screen (ADR 26, amended)
 *
 * A group of its own, between Preferences and Security. Its title line holds
 * the way in; the form asks for the current password, then the new one. The
 * API keeps this session and ends the others, and a wrong current password
 * is said as exactly that — it signs nobody out.
 */

const signedIn = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({
        user: { id: "u1", username: "dario", role: "user", mustChangePassword: false },
      }),
    ),
    http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
    http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
  );
};

/** The Password group, and nothing outside it. */
const openPassword = async (): Promise<HTMLElement> => {
  renderApp({ route: "/you" });

  const heading = await screen.findByRole("heading", { name: /^password$/i });

  return heading.closest("section") as HTMLElement;
};

const fillIn = async (group: HTMLElement, current: string, next: string): Promise<void> => {
  await userEvent.click(within(group).getByRole("button", { name: "Change password" }));
  await userEvent.type(within(group).getByLabelText("Current password"), current);
  await userEvent.type(within(group).getByLabelText("New password"), next);
  await userEvent.click(within(group).getByRole("button", { name: "Change it" }));
};

describe("changing your password, from the account screen", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    signedIn();
  });

  it("asks for the current password first, then the new one", async () => {
    const group = await openPassword();

    expect(within(group).queryByLabelText("Current password")).toBeNull();
    await userEvent.click(within(group).getByRole("button", { name: "Change password" }));

    const fields = within(group).getAllByLabelText(/password$/i, { selector: "input" });
    expect(fields.map((field) => field.id)).toEqual([
      within(group).getByLabelText("Current password").id,
      within(group).getByLabelText("New password").id,
    ]);
    expect(within(group).getByText("At least 12 characters.")).toBeVisible();
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

    expect(await within(group).findByText(/your password is changed/i)).toBeVisible();
    expect(body).toEqual({ password: "my-brand-new-password", currentPassword: "my-old-password" });
    expect(within(group).queryByLabelText("Current password")).toBeNull();
  });

  it("says a wrong current password is wrong, and keeps the person signed in", async () => {
    apiServer.use(
      http.post(`${API_URL}/auth/password`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "wrong" } },
          { status: 401 },
        ),
      ),
    );

    const group = await openPassword();
    await fillIn(group, "not-my-password", "my-brand-new-password");

    expect(
      await within(group).findByText("That is not your current password. Try typing it again."),
    ).toBeVisible();
    await waitFor(() => {
      expect(sessionStore.read()?.token).toBe("a-live-token");
    });
    expect(screen.queryByRole("heading", { name: /sign in to waymark/i })).toBeNull();
  });
});
