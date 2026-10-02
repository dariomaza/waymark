import {
  anAccount,
  aSession,
  aStorageUnit,
  aTree,
  withPhoto,
} from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fireEvent, renderApp, screen, waitFor, within } from "../testing/render-app.js";
import { theSheetCalled } from "../testing/the-sheet.js";

/**
 * # An administrator shares a space from its menu (ADR 26)
 *
 * The sheet lists every active person a share would mean something to, each
 * with three answers, and saves an answer the moment it is chosen. Nobody
 * else is offered it; the API would refuse them anyway. The same claims as
 * the browser's test of the same name.
 */

const ADMIN = anAccount({ id: "u1", username: "dario", role: "administrator" });
const OTHER_ADMIN = anAccount({ id: "u4", username: "boss", role: "administrator" });
const OWNER = anAccount({ id: "u2", username: "partner" });
const LODGER = anAccount({ id: "u3", username: "lodger" });
const CHILD = anAccount({ id: "u5", username: "child" });
const GONE = anAccount({ id: "u6", username: "gone", disabledAt: "2026-10-01T11:00:00.000Z" });

const attic = aStorageUnit({ id: "attic", name: "Attic", kind: "ROOM" });
const trunk = aStorageUnit({ id: "trunk", parentId: "attic", name: "Trunk" });

const OWNED_BY = { id: OWNER.id, username: OWNER.username };

interface Sent {
  readonly method: string;
  readonly accountId: string;
  readonly access: unknown;
}

const signedInAs = (role: "administrator" | "user"): Sent[] => {
  const sent: Sent[] = [];
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({
        user: { id: role === "administrator" ? ADMIN.id : OWNER.id, username: "me", role },
      }),
    ),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({
        mayMakeRoot: true,
        tree: [aTree(attic, [aTree(trunk, [], { owner: OWNED_BY })], { owner: OWNED_BY })],
      }),
    ),
    http.get(`${API_URL}/storage-units/trunk`, () =>
      HttpResponse.json({ unit: withPhoto(trunk), path: [attic, trunk], children: [], items: [] }),
    ),
    // The People group's order, which the sheet keeps: lodger before child.
    http.get(`${API_URL}/auth/accounts`, () =>
      HttpResponse.json({ accounts: [ADMIN, OTHER_ADMIN, OWNER, LODGER, CHILD, GONE] }),
    ),
    http.get(`${API_URL}/storage-units/trunk/shares`, () =>
      HttpResponse.json({
        shares: [{ account: { id: CHILD.id, username: CHILD.username }, access: "view" }],
      }),
    ),
    http.post(`${API_URL}/storage-units/trunk/shares/u3`, async ({ request }) => {
      const body = (await request.json()) as { access: unknown };
      sent.push({ method: "POST", accountId: "u3", access: body.access });
      return HttpResponse.json({
        share: { account: { id: "u3", username: "lodger" }, access: body.access },
      });
    }),
    http.delete(`${API_URL}/storage-units/trunk/shares/u5`, () => {
      sent.push({ method: "DELETE", accountId: "u5", access: null });
      return HttpResponse.empty({ status: 204 });
    }),
  );
  return sent;
};

const atTrunk = { name: "Unit", params: { id: "trunk" } } as const;

const openTheMenu = async (): Promise<ReturnType<typeof within>> => {
  await renderApp({ session: aSession(), screen: atTrunk });
  await fireEvent.press(await screen.findByRole("button", { name: "More actions for Trunk" }));

  return await theSheetCalled("More actions for Trunk");
};

const openTheShareSheet = async (): Promise<ReturnType<typeof within>> => {
  const menu = await openTheMenu();
  await fireEvent.press(await menu.findByRole("button", { name: "Share" }));

  return await theSheetCalled("Share Trunk");
};

/** The three answers for one person: a group named after them. */
const choiceFor = (sheet: ReturnType<typeof within>, username: string): ReturnType<typeof within> =>
  within(sheet.getByLabelText(username));

/** Whose answers the sheet lists, top to bottom: each "Not shared" names its group. */
const listedIn = (sheet: ReturnType<typeof within>): readonly string[] =>
  sheet
    .getAllByRole("radio", { name: "Not shared" })
    .map((radio) => String(radio.parent?.props.accessibilityLabel));

/**
 * One person's part of the sheet: their answers and whatever is said under
 * them. The widest view around their answers that holds nobody else's.
 */
const personIn = (sheet: ReturnType<typeof within>, username: string): ReturnType<typeof within> => {
  let node = sheet.getByLabelText(username);
  while (
    node.parent !== null &&
    within(node.parent).queryAllByRole("radio", { name: "Not shared" }).length === 1
  ) {
    node = node.parent;
  }

  return within(node);
};

const isChosen = (radio: { readonly props: Record<string, unknown> }): boolean =>
  (radio.props.accessibilityState as { readonly checked?: boolean } | undefined)?.checked === true;

describe("sharing a space, for an administrator", () => {
  let sent: Sent[];

  beforeEach(() => {
    sent = signedInAs("administrator");
  });

  it("lists every active person but administrators and the space's owner, in the People order", async () => {
    const sheet = await openTheShareSheet();

    await sheet.findByLabelText("lodger");

    expect(listedIn(sheet)).toEqual(["lodger", "child"]);
  });

  it("says that sharing a space shares everything inside it", async () => {
    const sheet = await openTheShareSheet();

    expect(await sheet.findByText("Sharing a space shares everything inside it.")).toBeOnTheScreen();
  });

  it("shows how far each person is shared with already", async () => {
    const sheet = await openTheShareSheet();
    await sheet.findByLabelText("lodger");

    expect(isChosen(choiceFor(sheet, "child").getByRole("radio", { name: "View" }))).toBe(true);
    expect(isChosen(choiceFor(sheet, "lodger").getByRole("radio", { name: "Not shared" }))).toBe(
      true,
    );
    expect(isChosen(choiceFor(sheet, "lodger").getByRole("radio", { name: "View" }))).toBe(false);
  });

  it("saves a choice the moment it is made", async () => {
    const sheet = await openTheShareSheet();
    await sheet.findByLabelText("lodger");

    await fireEvent.press(choiceFor(sheet, "lodger").getByRole("radio", { name: "View and edit" }));

    await waitFor(() => {
      expect(sent).toEqual([{ method: "POST", accountId: "u3", access: "edit" }]);
    });
  });

  it("stops sharing when Not shared is chosen", async () => {
    const sheet = await openTheShareSheet();
    await sheet.findByLabelText("child");

    await fireEvent.press(choiceFor(sheet, "child").getByRole("radio", { name: "Not shared" }));

    await waitFor(() => {
      expect(sent).toEqual([{ method: "DELETE", accountId: "u5", access: null }]);
    });
  });

  it("names a refusal with its own sentence, under that person's row", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units/trunk/shares/u3`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_DISABLED", message: "disabled", details: { accountId: "u3" } } },
          { status: 409 },
        ),
      ),
    );
    const sheet = await openTheShareSheet();
    await sheet.findByLabelText("lodger");

    await fireEvent.press(choiceFor(sheet, "lodger").getByRole("radio", { name: "View" }));

    const refusal =
      "That account is disabled. Enable it under People before sharing anything with it.";
    expect(await personIn(sheet, "lodger").findByText(refusal)).toBeOnTheScreen();
    expect(personIn(sheet, "child").queryByText(refusal)).toBeNull();
  });
});

describe("sharing a space, for anybody else", () => {
  beforeEach(() => {
    signedInAs("user");
  });

  it("is not offered", async () => {
    const menu = await openTheMenu();

    expect(menu.getByRole("button", { name: "Show the label" })).toBeOnTheScreen();
    expect(menu.queryByRole("button", { name: "Share" })).toBeNull();
  });
});
