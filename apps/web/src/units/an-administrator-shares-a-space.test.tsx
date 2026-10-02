import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { anAccount, aSession, aStorageUnit, aTree, withPhoto } from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

/**
 * # An administrator shares a space (ADR 26)
 *
 * From the space's own menu: a sheet listing everybody a share would mean
 * something to, each with Not shared / View / View and edit, saved the moment
 * it is chosen. Nobody else is offered it; the API would refuse them anyway.
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
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: role === "administrator" ? ADMIN.id : OWNER.id, username: "me", role } }),
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
    http.get(`${API_URL}/auth/accounts`, () =>
      HttpResponse.json({ accounts: [ADMIN, OTHER_ADMIN, OWNER, LODGER, CHILD, GONE] }),
    ),
    http.get(`${API_URL}/storage-units/trunk/shares`, () =>
      HttpResponse.json({
        shares: [{ account: { id: CHILD.id, username: CHILD.username }, access: "view" }],
      }),
    ),
    http.post(`${API_URL}/storage-units/trunk/shares/:accountId`, async ({ request, params }) => {
      const body = (await request.json()) as { access: unknown };
      sent.push({ method: "POST", accountId: String(params.accountId), access: body.access });
      return HttpResponse.json({
        share: { account: { id: String(params.accountId), username: "x" }, access: body.access },
      });
    }),
    http.delete(`${API_URL}/storage-units/trunk/shares/:accountId`, ({ params }) => {
      sent.push({ method: "DELETE", accountId: String(params.accountId), access: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
};

const openTheMenu = async (): Promise<void> => {
  renderApp({ route: "/units/trunk" });
  await screen.findByRole("heading", { name: /trunk/i });
  await userEvent.click(await screen.findByRole("button", { name: "More actions for Trunk" }));
};

const openTheShareSheet = async (): Promise<HTMLElement> => {
  await openTheMenu();
  await userEvent.click(await screen.findByRole("button", { name: "Share" }));
  return await screen.findByRole("dialog", { name: "Share Trunk" });
};

const choiceFor = (sheet: HTMLElement, username: string): HTMLElement =>
  within(sheet).getByRole("group", { name: username });

describe("sharing a space, for an administrator", () => {
  let sent: Sent[];

  beforeEach(() => {
    sent = signedInAs("administrator");
  });

  it("lists every active person but administrators and the space's owner", async () => {
    const sheet = await openTheShareSheet();

    await within(sheet).findByRole("group", { name: "lodger" });
    const groups = within(sheet)
      .getAllByRole("group")
      .map((group) => group.getAttribute("aria-labelledby"))
      .map((id) => (id === null ? "" : (document.getElementById(id)?.textContent ?? "")));

    expect([...groups].sort()).toEqual(["child", "lodger"]);
  });

  it("says that sharing a space shares everything inside it", async () => {
    const sheet = await openTheShareSheet();

    expect(
      await within(sheet).findByText("Sharing a space shares everything inside it."),
    ).toBeVisible();
  });

  it("shows how far each person is shared with already", async () => {
    const sheet = await openTheShareSheet();
    await within(sheet).findByRole("group", { name: "lodger" });

    expect(within(choiceFor(sheet, "child")).getByRole("radio", { name: "View" })).toBeChecked();
    expect(
      within(choiceFor(sheet, "lodger")).getByRole("radio", { name: "Not shared" }),
    ).toBeChecked();
  });

  it("saves a choice the moment it is made", async () => {
    const sheet = await openTheShareSheet();
    await within(sheet).findByRole("group", { name: "lodger" });

    await userEvent.click(
      within(choiceFor(sheet, "lodger")).getByRole("radio", { name: "View and edit" }),
    );

    await waitFor(() => {
      expect(sent).toEqual([{ method: "POST", accountId: "u3", access: "edit" }]);
    });
  });

  it("stops sharing when Not shared is chosen", async () => {
    const sheet = await openTheShareSheet();
    await within(sheet).findByRole("group", { name: "child" });

    await userEvent.click(
      within(choiceFor(sheet, "child")).getByRole("radio", { name: "Not shared" }),
    );

    await waitFor(() => {
      expect(sent).toEqual([{ method: "DELETE", accountId: "u5", access: null }]);
    });
  });

  it("names a refusal with its own sentence", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units/trunk/shares/:accountId`, () =>
        HttpResponse.json(
          { error: { code: "ACCOUNT_DISABLED", message: "disabled", details: { accountId: "u3" } } },
          { status: 409 },
        ),
      ),
    );
    const sheet = await openTheShareSheet();
    await within(sheet).findByRole("group", { name: "lodger" });

    await userEvent.click(within(choiceFor(sheet, "lodger")).getByRole("radio", { name: "View" }));

    expect(
      await within(sheet).findByText(
        "That account is disabled. Enable it under People before sharing anything with it.",
      ),
    ).toBeVisible();
  });
});

describe("sharing a space, for anybody else", () => {
  beforeEach(() => {
    signedInAs("user");
  });

  it("is not offered", async () => {
    await openTheMenu();

    await screen.findByRole("link", { name: /show the label/i });
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });
});
