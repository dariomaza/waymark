import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * Every key and value a storage holds, as one string to search. Read through
 * `key(i)`, not `Object.keys`: jsdom keeps entries behind an index, so the
 * obvious spelling would pass against a storage full of secrets.
 */
const everythingIn = (storage: Storage | undefined): string => {
  if (storage === undefined) {
    return "";
  }

  const values: string[] = [];
  for (let at = 0; at < storage.length; at += 1) {
    const key = storage.key(at);
    values.push(key ?? "", (key === null ? null : storage.getItem(key)) ?? "");
  }

  return values.join("\n");
};

/**
 * A working `Storage`. This jsdom build has no `localStorage` at all, so an
 * assertion against the real one would pass whatever the code wrote — the
 * write would just throw somewhere nobody looks. The tests that promise the
 * password is never stored put one of these in its place first.
 */
const aWorkingStorage = (): Storage => {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    key: (at: number) => [...entries.keys()][at] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
};

/** Real storages in place of the missing ones, for as long as one test runs. */
const withWorkingStorage = (): void => {
  vi.stubGlobal("localStorage", aWorkingStorage());
  vi.stubGlobal("sessionStorage", aWorkingStorage());
};

afterEach(() => {
  vi.unstubAllGlobals();
});

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

    it("says which person has not chosen their password yet", async () => {
      signedInAs("administrator");
      theHouseHolds(DARIO, PARTNER, anAccount({ id: "u3", username: "child", mustChangePassword: true }));

      const people = await openPeople();

      const child = await rowOf(people, "child");
      expect(within(child).getByText("Has not chosen a password yet")).toBeVisible();
      const partner = await rowOf(people, "partner");
      expect(within(partner).queryByText("Has not chosen a password yet")).toBeNull();
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

    const addingAnswers = (temporaryPassword: string): { body: () => unknown } => {
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/accounts`, async ({ request }) => {
          body = await request.json();
          const account = anAccount({ id: "u3", username: "child", mustChangePassword: true });
          listed = [...listed, account];
          return HttpResponse.json({ account, temporaryPassword }, { status: 201 });
        }),
      );
      return { body: () => body };
    };

    const addChild = async (people: HTMLElement): Promise<void> => {
      await within(people).findByText("partner");
      await userEvent.click(within(people).getByRole("button", { name: "Add a person" }));
      await userEvent.type(within(people).getByRole("textbox", { name: "Username" }), "child");
      await userEvent.selectOptions(within(people).getByRole("combobox", { name: "Role" }), "user");
      await userEvent.click(within(people).getByRole("button", { name: "Add them" }));
    };

    /** The server makes the password (ADR 26, amended): nobody types one. */
    it("asks only for a username and a role, and sends exactly those", async () => {
      const adding = addingAnswers("wxmc-hepa-rtkd-ufbn");

      const people = await openPeople();
      await within(people).findByText("partner");
      await userEvent.click(within(people).getByRole("button", { name: "Add a person" }));

      expect(within(people).queryByLabelText(/password/i)).toBeNull();

      await userEvent.type(within(people).getByRole("textbox", { name: "Username" }), "child");
      await userEvent.click(within(people).getByRole("button", { name: "Add them" }));

      await waitFor(() => {
        expect(adding.body()).toEqual({ username: "child", role: "user" });
      });
      expect(await within(people).findByText("child")).toBeVisible();
    });

    it("shows the temporary password once, with a way to copy it and the warning before the way out", async () => {
      addingAnswers("wxmc-hepa-rtkd-ufbn");

      const people = await openPeople();
      await addChild(people);

      const shown = await within(people).findByRole("alert");
      expect(within(shown).getByText("The temporary password for child")).toBeVisible();
      expect(within(shown).getByText("wxmc-hepa-rtkd-ufbn")).toBeVisible();
      expect(within(shown).getByRole("button", { name: "Copy" })).toBeVisible();
      expect(within(shown).getByText(/only time you will see it/i)).toBeVisible();
      expect(within(shown).getByText(/choose a password of their own/i)).toBeVisible();

      await userEvent.click(within(shown).getByRole("button", { name: "I have it" }));

      expect(within(people).queryByText("wxmc-hepa-rtkd-ufbn")).toBeNull();
    });

    it("never puts the temporary password in browser storage", async () => {
      withWorkingStorage();
      addingAnswers("wxmc-hepa-rtkd-ufbn");

      const people = await openPeople();
      await addChild(people);
      await within(people).findByText("wxmc-hepa-rtkd-ufbn");

      expect(everythingIn(globalThis.localStorage)).not.toContain("wxmc-hepa-rtkd-ufbn");
      expect(everythingIn(globalThis.sessionStorage)).not.toContain("wxmc-hepa-rtkd-ufbn");
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

    const resetAnswers = (): { body: () => unknown } => {
      let body: unknown = "not sent";
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/password`, async ({ request }) => {
          body = await request.text();
          return HttpResponse.json({
            account: { ...PARTNER, mustChangePassword: true },
            temporaryPassword: "wxmc-hepa-rtkd-ufbn",
          });
        }),
      );
      return { body: () => body };
    };

    const askToReset = async (): Promise<HTMLElement> => {
      const people = await openPeople();
      const menu = await openMenuOf(people, "partner");
      await userEvent.click(within(menu).getByRole("button", { name: "Reset password" }));

      return await screen.findByRole("dialog", { name: "Reset the password of partner?" });
    };

    it("says they are signed out everywhere before the button, asks for no password, and sends none", async () => {
      const reset = resetAnswers();

      const sheet = await askToReset();
      expect(within(sheet).getByText(/signed out everywhere/i)).toBeVisible();
      expect(within(sheet).queryByLabelText(/password/i)).toBeNull();
      await userEvent.click(within(sheet).getByRole("button", { name: "Reset it" }));

      await waitFor(() => {
        expect(reset.body()).toBe("");
      });
    });

    it("shows the new temporary password once, never stores it, then closes", async () => {
      withWorkingStorage();
      resetAnswers();

      const sheet = await askToReset();
      await userEvent.click(within(sheet).getByRole("button", { name: "Reset it" }));

      const shown = await within(sheet).findByRole("alert");
      expect(within(shown).getByText("The temporary password for partner")).toBeVisible();
      expect(within(shown).getByText("wxmc-hepa-rtkd-ufbn")).toBeVisible();
      expect(within(shown).getByRole("button", { name: "Copy" })).toBeVisible();
      expect(within(shown).getByText(/only time you will see it/i)).toBeVisible();
      expect(everythingIn(globalThis.localStorage)).not.toContain("wxmc-hepa-rtkd-ufbn");
      expect(everythingIn(globalThis.sessionStorage)).not.toContain("wxmc-hepa-rtkd-ufbn");

      await userEvent.click(within(shown).getByRole("button", { name: "I have it" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Reset the password of partner?" })).toBeNull();
      });
      expect(screen.queryByText("wxmc-hepa-rtkd-ufbn")).toBeNull();
    });

    it("names the refusal inside the sheet", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/password`, () =>
          HttpResponse.json(
            { error: { code: "ACCOUNT_NOT_FOUND", message: "gone" } },
            { status: 404 },
          ),
        ),
      );

      const sheet = await askToReset();
      await userEvent.click(within(sheet).getByRole("button", { name: "Reset it" }));

      expect(await within(sheet).findByText(/not here any more/i)).toBeVisible();
    });
  });
});
