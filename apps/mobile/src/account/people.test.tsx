import { anAccount, aSession } from "@waymark/api-client/testing";

import { inMemorySecureStorage, type SecureStorage } from "../auth/secure-storage.js";
import { LANGUAGE_KEY } from "../app/language.js";
import { SESSION_KEY } from "../auth/session-store.js";
import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fakeClipboard } from "../testing/fake-clipboard.js";
import {
  everythingCached,
  fireEvent,
  renderApp,
  screen,
  waitFor,
  within,
} from "../testing/render-app.js";
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

/** Adding a person answers this temporary password; the body sent is kept. */
const addingAnswers = (temporaryPassword: string): { body: () => unknown } => {
  let body: unknown;
  apiServer.use(
    http.post(`${API_URL}/auth/accounts`, async ({ request }) => {
      body = await request.json();
      const sent = body as { username: string; role: "administrator" | "user" };
      const account = anAccount({ id: "u3", username: sent.username, role: sent.role, mustChangePassword: true });
      listed = [...listed, account];
      return HttpResponse.json({ account, temporaryPassword }, { status: 201 });
    }),
  );

  return { body: () => body };
};

/** Resetting partner's password answers this one; the body sent is kept. */
const resetAnswers = (temporaryPassword: string): { body: () => unknown } => {
  let body: unknown = "not sent";
  apiServer.use(
    http.post(`${API_URL}/auth/accounts/u2/password`, async ({ request }) => {
      body = await request.text();
      return HttpResponse.json({ account: PARTNER, temporaryPassword });
    }),
  );

  return { body: () => body };
};

const addChild = async (): Promise<void> => {
  await openYourAccount();
  await fireEvent.press(await screen.findByRole("button", { name: "Add a person" }));
  await fireEvent.changeText(screen.getByLabelText("Username"), "child");
  await fireEvent.press(screen.getByRole("button", { name: "Add them" }));
};

const askToReset = async (): Promise<void> => {
  await openYourAccount();
  const menu = await openMenuOf("partner");
  await fireEvent.press(menu.getByRole("button", { name: "Reset password" }));
  await screen.findByRole("header", { name: "Reset the password of partner?" });
};

/** The People group, and nothing outside it: the account screen has a Password group too. */
const peopleGroup = (): ReturnType<typeof within> => {
  const group = screen.getByRole("header", { name: "People" }).parent?.parent ?? null;
  if (group === null) {
    throw new Error("People is not the title of a group");
  }

  return within(group);
};

/**
 * The panel that shows a temporary password, and nothing outside it: found by
 * its title, which names whose password it is.
 */
const panelTitled = async (title: string): Promise<ReturnType<typeof within>> => {
  const heading = await screen.findByText(title);
  if (heading.parent === null) {
    throw new Error(`"${title}" is not inside a panel`);
  }

  return within(heading.parent);
};

/**
 * The keystore, keeping every value anything wrote to it — plainly or sealed
 * — so a test can say a secret was never one of them.
 */
const recordingStorage = (): SecureStorage & { written: () => string } => {
  const values: string[] = [];
  const held = inMemorySecureStorage({ [SESSION_KEY]: JSON.stringify(aSession()), [LANGUAGE_KEY]: "en" });

  return {
    ...held,
    write: async (key, value) => {
      values.push(key, value);
      await held.write(key, value);
    },
    seal: async (key, value, prompt) => {
      values.push(key, value);
      await held.seal(key, value, prompt);
    },
    written: () => values.join("\n"),
  };
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

    it("says which person has not chosen their password yet", async () => {
      signedInAs("administrator");
      theHouseHolds(DARIO, PARTNER, anAccount({ id: "u3", username: "child", mustChangePassword: true }));

      await renderApp({ session: aSession() });
      await openYourAccount();

      expect(await screen.findByText("child")).toBeOnTheScreen();
      expect(screen.getAllByText("Has not chosen a password yet")).toHaveLength(1);
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
    it("asks only for a username and a role, and sends exactly those", async () => {
      signedInAs("administrator");
      const adding = addingAnswers("wxmc-hepa-rtkd-ufbn");

      await renderApp({ session: aSession() });
      await openYourAccount();
      await fireEvent.press(await screen.findByRole("button", { name: "Add a person" }));

      expect(peopleGroup().queryByLabelText(/password/i)).toBeNull();

      await fireEvent.changeText(screen.getByLabelText("Username"), "child");
      await fireEvent.press(screen.getByRole("radio", { name: "Administrator" }));
      await fireEvent.press(screen.getByRole("button", { name: "Add them" }));

      await waitFor(() => {
        expect(adding.body()).toEqual({ username: "child", role: "administrator" });
      });
      expect(await screen.findByText("child")).toBeOnTheScreen();
    });

    it("shows the temporary password once, with a way to copy it and the warning before the way out", async () => {
      signedInAs("administrator");
      addingAnswers("wxmc-hepa-rtkd-ufbn");
      const clipboard = fakeClipboard();

      await renderApp({ session: aSession(), clipboard });
      await addChild();

      const shown = await panelTitled("The temporary password for child");
      expect(shown.getByText("wxmc-hepa-rtkd-ufbn")).toBeOnTheScreen();
      expect(shown.getByText(/only time you will see it/i)).toBeOnTheScreen();
      expect(shown.getByText(/choose a password of their own/i)).toBeOnTheScreen();

      await fireEvent.press(shown.getByRole("button", { name: "Copy" }));
      await waitFor(() => {
        expect(clipboard.copied).toEqual(["wxmc-hepa-rtkd-ufbn"]);
      });

      await fireEvent.press(shown.getByRole("button", { name: "I have it" }));

      await waitFor(() => {
        expect(screen.queryByText("wxmc-hepa-rtkd-ufbn")).toBeNull();
      });
    });

    it("never puts the temporary password in the keystore or the query cache", async () => {
      signedInAs("administrator");
      addingAnswers("wxmc-hepa-rtkd-ufbn");
      const storage = recordingStorage();

      await renderApp({ session: aSession(), storage });
      await addChild();
      const shown = await panelTitled("The temporary password for child");
      expect(shown.getByText("wxmc-hepa-rtkd-ufbn")).toBeOnTheScreen();

      expect(storage.written()).not.toContain("wxmc-hepa-rtkd-ufbn");
      expect(everythingCached()).not.toContain("wxmc-hepa-rtkd-ufbn");

      await fireEvent.press(shown.getByRole("button", { name: "I have it" }));

      // Forgotten at once (gcTime 0), not when the cache next gets round to it.
      await waitFor(() => {
        expect(everythingCached()).not.toContain("wxmc-hepa-rtkd-ufbn");
      });
      expect(storage.written()).not.toContain("wxmc-hepa-rtkd-ufbn");
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
    beforeEach(() => {
      signedInAs("administrator");
    });

    it("says they are signed out everywhere before the button, asks for no password, and sends none", async () => {
      const reset = resetAnswers("wxmc-hepa-rtkd-ufbn");

      await renderApp({ session: aSession() });
      await askToReset();

      expect(screen.getByText(/signed out everywhere/i)).toBeOnTheScreen();
      expect(screen.queryByLabelText(/password/i)).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Reset it" }));

      await waitFor(() => {
        expect(reset.body()).toBe("");
      });
    });

    it("shows the new temporary password once, never stores it, then closes", async () => {
      resetAnswers("wxmc-hepa-rtkd-ufbn");
      const storage = recordingStorage();

      await renderApp({ session: aSession(), storage });
      await askToReset();
      await fireEvent.press(screen.getByRole("button", { name: "Reset it" }));

      const shown = await panelTitled("The temporary password for partner");
      expect(shown.getByText("wxmc-hepa-rtkd-ufbn")).toBeOnTheScreen();
      expect(shown.getByRole("button", { name: "Copy" })).toBeOnTheScreen();
      expect(shown.getByText(/only time you will see it/i)).toBeOnTheScreen();
      expect(storage.written()).not.toContain("wxmc-hepa-rtkd-ufbn");
      expect(everythingCached()).not.toContain("wxmc-hepa-rtkd-ufbn");

      await fireEvent.press(shown.getByRole("button", { name: "I have it" }));

      await waitFor(() => {
        expect(screen.queryByRole("header", { name: "Reset the password of partner?" })).toBeNull();
      });
      expect(screen.queryByText("wxmc-hepa-rtkd-ufbn")).toBeNull();
    });

    it("names the refusal inside the sheet", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/accounts/u2/password`, () =>
          HttpResponse.json({ error: { code: "ACCOUNT_NOT_FOUND", message: "gone" } }, { status: 404 }),
        ),
      );

      await renderApp({ session: aSession() });
      await askToReset();
      await fireEvent.press(screen.getByRole("button", { name: "Reset it" }));

      expect(await screen.findByText(/not here any more/i)).toBeOnTheScreen();
    });
  });
});
