import { anAccount, aSession } from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # People, from the phone (ADR 26)
 *
 * The same group the browser draws, on the account tab: shown only when
 * `/auth/me` says an administrator is signed in, one primary action — add a
 * person — and a menu beside each name for everything else (ADR 21).
 * Disabling and resetting a password are asked first, in a sheet that says
 * what happens.
 */

const DARIO = anAccount({ id: "u1", username: "dario", role: "administrator" });
const PARTNER = anAccount({ id: "u2", username: "partner" });

const signedInAs = (role: "administrator" | "user"): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario", role } }),
    ),
  );
};

let listed: ReturnType<typeof anAccount>[] = [];

const theHouseHolds = (...accounts: ReturnType<typeof anAccount>[]): void => {
  listed = accounts;
  apiServer.use(
    http.get(`${API_URL}/auth/accounts`, () => HttpResponse.json({ accounts: listed })),
  );
};

const openYourAccount = async (): Promise<void> => {
  await screen.findByText(/scan a label/i);
  await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));
  await screen.findByText("Signed in");
};

/**
 * The menu beside a name, open. Its lines are found on the whole screen: a
 * sheet here is a modal over the tab, and none of these words is drawn
 * anywhere else on it.
 */
const openMenuOf = async (username: string): Promise<typeof screen> => {
  await fireEvent.press(
    await screen.findByRole("button", { name: `More actions for ${username}` }),
  );
  await screen.findByRole("header", { name: `More actions for ${username}` });

  return screen;
};

describe("people, from the phone", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
    theHouseHolds(DARIO, PARTNER);
  });

  describe("who sees the group", () => {
    it("is shown to an administrator, with every person, their role and their state", async () => {
      signedInAs("administrator");
      theHouseHolds(
        DARIO,
        PARTNER,
        anAccount({ id: "u3", username: "lodger", disabledAt: "2026-10-01T10:00:00.000Z" }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();

      expect(await screen.findByText("People")).toBeOnTheScreen();
      expect(await screen.findByText("partner")).toBeOnTheScreen();
      expect(screen.getByText("lodger")).toBeOnTheScreen();
      expect(screen.getByText("Administrator")).toBeOnTheScreen();
      expect(screen.getAllByText("User")).toHaveLength(2);
      expect(screen.getByText("That is you")).toBeOnTheScreen();
      expect(screen.getAllByText("Disabled")).toHaveLength(1);
    });

    /**
     * Not even asked for: a request no handler answered fails the test, and
     * this one has `/auth/accounts` removed.
     */
    it("is not shown to a person who is not an administrator, and the list is never asked for", async () => {
      apiServer.resetHandlers();
      theApiKnowsTheHouse();
      signedInAs("user");

      await renderApp({ session: aSession() });
      await openYourAccount();
      await screen.findByText("Connected programs");

      expect(screen.queryByText("People")).toBeNull();
      expect(screen.queryByRole("button", { name: "Add a person" })).toBeNull();
    });
  });

  describe("adding a person", () => {
    it("sends the username, the typed password and the role, and lists them", async () => {
      signedInAs("administrator");
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts`, async ({ request }) => {
          body = await request.json();
          const account = anAccount({ id: "u3", username: "child", role: "administrator" });
          listed = [...listed, account];
          return HttpResponse.json({ account }, { status: 201 });
        }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();
      await fireEvent.press(await screen.findByRole("button", { name: "Add a person" }));
      await fireEvent.changeText(screen.getByLabelText("Username"), "child");
      await fireEvent.changeText(screen.getByLabelText("Password"), "the-child-password");
      await fireEvent.press(screen.getByRole("radio", { name: "Administrator" }));
      await fireEvent.press(screen.getByRole("button", { name: "Add them" }));

      await waitFor(() => {
        expect(body).toEqual({
          username: "child",
          password: "the-child-password",
          role: "administrator",
        });
      });
      expect(await screen.findByText("child")).toBeOnTheScreen();
    });

    it("says a username is taken, naming it", async () => {
      signedInAs("administrator");
      apiServer.use(
        http.post(`${API_URL}/auth/accounts`, () =>
          HttpResponse.json(
            { error: { code: "USERNAME_ALREADY_TAKEN", message: "taken", details: { username: "partner" } } },
            { status: 409 },
          ),
        ),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();
      await fireEvent.press(await screen.findByRole("button", { name: "Add a person" }));
      await fireEvent.changeText(screen.getByLabelText("Username"), "partner");
      await fireEvent.changeText(screen.getByLabelText("Password"), "the-partner-password");
      await fireEvent.press(screen.getByRole("button", { name: "Add them" }));

      expect(await screen.findByText("Somebody is already called partner.")).toBeOnTheScreen();
    });
  });

  describe("the menu beside a name", () => {
    beforeEach(() => {
      signedInAs("administrator");
    });

    it("offers a role change, a password reset and disabling", async () => {
      await renderApp({ session: aSession() });
      await openYourAccount();

      const menu = await openMenuOf("partner");

      expect(menu.getByRole("button", { name: "Make an administrator" })).toBeOnTheScreen();
      expect(menu.getByRole("button", { name: "Reset password" })).toBeOnTheScreen();
      expect(menu.getByRole("button", { name: "Disable" })).toBeOnTheScreen();
      expect(menu.queryByRole("button", { name: "Enable" })).toBeNull();
    });

    it("offers to enable a disabled person, and not to disable them", async () => {
      theHouseHolds(
        DARIO,
        anAccount({ id: "u2", username: "partner", disabledAt: "2026-10-01T10:00:00.000Z" }),
      );
      let enabled = false;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/enable`, () => {
          enabled = true;
          return HttpResponse.json({ account: PARTNER });
        }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();
      const menu = await openMenuOf("partner");

      expect(menu.queryByRole("button", { name: "Disable" })).toBeNull();
      await fireEvent.press(menu.getByRole("button", { name: "Enable" }));

      await waitFor(() => {
        expect(enabled).toBe(true);
      });
    });

    /** Everything it would offer on your own row is refused for yourself. */
    it("is not drawn on your own row", async () => {
      await renderApp({ session: aSession() });
      await openYourAccount();

      expect(
        await screen.findByRole("button", { name: "More actions for partner" }),
      ).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "More actions for dario" })).toBeNull();
    });

    it("names the refusal of the last administrator, should it happen", async () => {
      theHouseHolds(DARIO, anAccount({ id: "u2", username: "partner", role: "administrator" }));
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/role`, () =>
          HttpResponse.json({ error: { code: "LAST_ADMINISTRATOR", message: "last" } }, { status: 409 }),
        ),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();
      const menu = await openMenuOf("partner");
      await fireEvent.press(menu.getByRole("button", { name: "Make a user" }));

      expect(
        await screen.findByText(
          "This is the last active administrator. Make somebody else an administrator first.",
        ),
      ).toBeOnTheScreen();
    });
  });

  describe("disabling a person", () => {
    it("asks first, saying they are signed out everywhere and their tokens stop working", async () => {
      signedInAs("administrator");
      let disabled = false;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/disable`, () => {
          disabled = true;
          return HttpResponse.json({ account: PARTNER });
        }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();
      const menu = await openMenuOf("partner");
      await fireEvent.press(menu.getByRole("button", { name: "Disable" }));

      await screen.findByRole("header", { name: "Disable partner?" });
      const sheet = screen;
      expect(
        sheet.getByText(/signed out everywhere and their machine tokens stop working/i),
      ).toBeOnTheScreen();
      expect(disabled).toBe(false);

      await fireEvent.press(sheet.getByRole("button", { name: "Disable them" }));

      await waitFor(() => {
        expect(disabled).toBe(true);
      });
    });
  });

  describe("resetting a password", () => {
    it("asks for the new password, says they are signed out everywhere, and sends it", async () => {
      signedInAs("administrator");
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/password`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ account: PARTNER });
        }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();
      const menu = await openMenuOf("partner");
      await fireEvent.press(menu.getByRole("button", { name: "Reset password" }));

      await screen.findByRole("header", { name: "Reset the password of partner?" });
      const sheet = screen;
      expect(sheet.getByText(/signed out everywhere/i)).toBeOnTheScreen();
      await fireEvent.changeText(sheet.getByLabelText("New password"), "a-brand-new-password");
      await fireEvent.press(sheet.getByRole("button", { name: "Reset it" }));

      await waitFor(() => {
        expect(body).toEqual({ password: "a-brand-new-password" });
      });
    });

    it("says how long the password has to be, in the API's number", async () => {
      signedInAs("administrator");
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/password`, () =>
          HttpResponse.json(
            { error: { code: "PASSWORD_TOO_SHORT", message: "short", details: { minimumLength: 12 } } },
            { status: 422 },
          ),
        ),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();
      const menu = await openMenuOf("partner");
      await fireEvent.press(menu.getByRole("button", { name: "Reset password" }));
      await screen.findByRole("header", { name: "Reset the password of partner?" });
      const sheet = screen;
      await fireEvent.changeText(sheet.getByLabelText("New password"), "short");
      await fireEvent.press(sheet.getByRole("button", { name: "Reset it" }));

      expect(await sheet.findByText("The password needs at least 12 characters.")).toBeOnTheScreen();
    });
  });
});
