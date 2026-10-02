import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { anAccount, aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";

import { sessionStore } from "./session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

/**
 * # People: an administrator manages the other accounts (ADR 26)
 *
 * A group on the account screen, drawn only when `/auth/me` says the person
 * signed in is an administrator. One primary action — add a person — and
 * everything else in a menu beside each name (ADR 21). Disabling and
 * resetting a password are asked about first, in a sheet that says what
 * happens.
 */

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });

const DARIO = anAccount({ id: "u1", username: "dario", role: "administrator" });
const PARTNER = anAccount({ id: "u2", username: "partner" });

/** Who `/auth/me` says is signed in, and the rest of the account screen. */
const signedInAs = (role: "administrator" | "user"): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario", role } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [aTree(garage)] })),
    http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
    http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
  );
};

let listed: ReturnType<typeof anAccount>[];

const theHouseHolds = (...accounts: ReturnType<typeof anAccount>[]): void => {
  listed = accounts;
  apiServer.use(http.get(`${API_URL}/auth/accounts`, () => HttpResponse.json({ accounts: listed })));
};

/** The People group, and nothing outside it. */
const openPeople = async (): Promise<HTMLElement> => {
  renderApp({ route: "/you" });

  const heading = await screen.findByRole("heading", { name: /^people$/i });

  return heading.closest("section") as HTMLElement;
};

const rowOf = async (people: HTMLElement, username: string): Promise<HTMLElement> =>
  (await within(people).findByText(username)).closest("li") as HTMLElement;

const openMenuOf = async (people: HTMLElement, username: string): Promise<HTMLElement> => {
  const row = await rowOf(people, username);
  await userEvent.click(
    within(row).getByRole("button", { name: `More actions for ${username}` }),
  );

  return await screen.findByRole("dialog", { name: `More actions for ${username}` });
};

describe("people, from the account screen", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
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

      const people = await openPeople();

      const dario = await rowOf(people, "dario");
      expect(within(dario).getByText("Administrator")).toBeVisible();
      expect(within(dario).getByText("That is you")).toBeVisible();
      const partner = await rowOf(people, "partner");
      expect(within(partner).getByText("User")).toBeVisible();
      expect(within(partner).queryByText("Disabled")).toBeNull();
      const lodger = await rowOf(people, "lodger");
      expect(within(lodger).getByText("Disabled")).toBeVisible();
    });

    /**
     * Not even asked for: `setup.ts` fails a test that makes a request no
     * handler declared, and this one declares no `/auth/accounts` at all.
     */
    it("is not shown to a person who is not an administrator, and the list is never asked for", async () => {
      signedInAs("user");
      apiServer.resetHandlers();
      signedInAs("user");

      renderApp({ route: "/you" });
      await screen.findByRole("heading", { name: /connected programs/i });

      expect(screen.queryByRole("heading", { name: /^people$/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /add a person/i })).toBeNull();
    });
  });

  describe("adding a person", () => {
    beforeEach(() => {
      signedInAs("administrator");
    });

    it("sends the username, the typed password and the role, and lists them", async () => {
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts`, async ({ request }) => {
          body = await request.json();
          const account = anAccount({ id: "u3", username: "child" });
          listed = [...listed, account];
          return HttpResponse.json({ account }, { status: 201 });
        }),
      );

      const people = await openPeople();
      await within(people).findByText("partner");
      await userEvent.click(within(people).getByRole("button", { name: "Add a person" }));
      await userEvent.type(within(people).getByRole("textbox", { name: "Username" }), "child");
      await userEvent.type(within(people).getByLabelText("Password"), "the-child-password");
      await userEvent.selectOptions(within(people).getByRole("combobox", { name: "Role" }), "user");
      await userEvent.click(within(people).getByRole("button", { name: "Add them" }));

      await waitFor(() => {
        expect(body).toEqual({ username: "child", password: "the-child-password", role: "user" });
      });
      expect(await within(people).findByText("child")).toBeVisible();
    });

    it("says a username is taken, naming it", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/accounts`, () =>
          HttpResponse.json(
            { error: { code: "USERNAME_ALREADY_TAKEN", message: "taken", details: { username: "partner" } } },
            { status: 409 },
          ),
        ),
      );

      const people = await openPeople();
      await within(people).findByText("partner");
      await userEvent.click(within(people).getByRole("button", { name: "Add a person" }));
      await userEvent.type(within(people).getByRole("textbox", { name: "Username" }), "partner");
      await userEvent.type(within(people).getByLabelText("Password"), "the-partner-password");
      await userEvent.click(within(people).getByRole("button", { name: "Add them" }));

      expect(await within(people).findByText("Somebody is already called partner.")).toBeVisible();
    });
  });

  describe("the menu beside a name", () => {
    beforeEach(() => {
      signedInAs("administrator");
    });

    it("offers a role change, a password reset and disabling", async () => {
      const people = await openPeople();

      const menu = await openMenuOf(people, "partner");

      expect(within(menu).getByRole("button", { name: "Make an administrator" })).toBeVisible();
      expect(within(menu).getByRole("button", { name: "Reset password" })).toBeVisible();
      expect(within(menu).getByRole("button", { name: "Disable" })).toBeVisible();
      expect(within(menu).queryByRole("button", { name: "Enable" })).toBeNull();
    });

    it("offers to enable a disabled person, and not to disable them", async () => {
      theHouseHolds(DARIO, anAccount({ id: "u2", username: "partner", disabledAt: "2026-10-01T10:00:00.000Z" }));
      let enabled = false;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/enable`, () => {
          enabled = true;
          return HttpResponse.json({ account: PARTNER });
        }),
      );

      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");

      expect(within(menu).queryByRole("button", { name: "Disable" })).toBeNull();
      await userEvent.click(within(menu).getByRole("button", { name: "Enable" }));

      await waitFor(() => {
        expect(enabled).toBe(true);
      });
    });

    it("makes a user an administrator", async () => {
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/role`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ account: { ...PARTNER, role: "administrator" } });
        }),
      );

      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");
      await userEvent.click(within(menu).getByRole("button", { name: "Make an administrator" }));

      await waitFor(() => {
        expect(body).toEqual({ role: "administrator" });
      });
    });

    /** Everything it would offer on your own row is refused for yourself. */
    it("is not drawn on your own row", async () => {
      const people = await openPeople();

      const dario = await rowOf(people, "dario");

      expect(within(dario).queryByRole("button", { name: /more actions/i })).toBeNull();
    });

    it("names the refusal of the last administrator, should it happen", async () => {
      theHouseHolds(DARIO, anAccount({ id: "u2", username: "partner", role: "administrator" }));
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/role`, () =>
          HttpResponse.json(
            { error: { code: "LAST_ADMINISTRATOR", message: "last" } },
            { status: 409 },
          ),
        ),
      );

      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");
      await userEvent.click(within(menu).getByRole("button", { name: "Make a user" }));

      expect(
        await within(people).findByText(
          "This is the last active administrator. Make somebody else an administrator first.",
        ),
      ).toBeVisible();
    });
  });

  describe("disabling a person", () => {
    beforeEach(() => {
      signedInAs("administrator");
    });

    it("asks first, saying they are signed out everywhere and their tokens stop working", async () => {
      let disabled = false;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/disable`, () => {
          disabled = true;
          return HttpResponse.json({ account: PARTNER });
        }),
      );

      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");
      await userEvent.click(within(menu).getByRole("button", { name: "Disable" }));

      const sheet = await screen.findByRole("dialog", { name: "Disable partner?" });
      expect(
        within(sheet).getByText(/signed out everywhere and their machine tokens stop working/i),
      ).toBeVisible();
      expect(disabled).toBe(false);

      await userEvent.click(within(sheet).getByRole("button", { name: "Disable them" }));

      await waitFor(() => {
        expect(disabled).toBe(true);
      });
    });

    it("names your own account's refusal inside the sheet, should it happen", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/disable`, () =>
          HttpResponse.json({ error: { code: "OWN_ACCOUNT", message: "own" } }, { status: 409 }),
        ),
      );

      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");
      await userEvent.click(within(menu).getByRole("button", { name: "Disable" }));
      const sheet = await screen.findByRole("dialog", { name: "Disable partner?" });
      await userEvent.click(within(sheet).getByRole("button", { name: "Disable them" }));

      expect(
        await within(sheet).findByText("Another administrator has to change your own account."),
      ).toBeVisible();
    });
  });

  describe("resetting a password", () => {
    beforeEach(() => {
      signedInAs("administrator");
    });

    it("asks for the new password, says they are signed out everywhere, and sends it", async () => {
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/password`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ account: PARTNER });
        }),
      );

      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");
      await userEvent.click(within(menu).getByRole("button", { name: "Reset password" }));

      const sheet = await screen.findByRole("dialog", { name: "Reset the password of partner?" });
      expect(within(sheet).getByText(/signed out everywhere/i)).toBeVisible();
      await userEvent.type(within(sheet).getByLabelText("New password"), "a-brand-new-password");
      await userEvent.click(within(sheet).getByRole("button", { name: "Reset it" }));

      await waitFor(() => {
        expect(body).toEqual({ password: "a-brand-new-password" });
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Reset the password of partner?" })).toBeNull();
      });
    });

    it("says how long the password has to be, in the API's number", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/password`, () =>
          HttpResponse.json(
            { error: { code: "PASSWORD_TOO_SHORT", message: "short", details: { minimumLength: 12 } } },
            { status: 422 },
          ),
        ),
      );

      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");
      await userEvent.click(within(menu).getByRole("button", { name: "Reset password" }));
      const sheet = await screen.findByRole("dialog", { name: "Reset the password of partner?" });
      await userEvent.type(within(sheet).getByLabelText("New password"), "short");
      await userEvent.click(within(sheet).getByRole("button", { name: "Reset it" }));

      expect(
        await within(sheet).findByText("The password needs at least 12 characters."),
      ).toBeVisible();
    });
  });
});
