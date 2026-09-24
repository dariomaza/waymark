import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";

import { sessionStore } from "./session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

/**
 * # Credentials for programs, from the account sheet
 *
 * ADR 18 put four routes in front of the machine-token use cases, behind a
 * person's session. This is what that looks like to the person: a list of what
 * exists, a way to make one, a way to replace the secret behind one, and a way
 * to kill one — all inside the sheet the avatar already opens.
 *
 * The secret is what most of this file is about. It exists exactly once, in
 * exactly one response, and the interface has to say so while it is still on
 * screen rather than afterwards.
 */

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });

const aMachineTokenView = (overrides: Record<string, unknown> = {}) => ({
  id: "mt1",
  name: "mcp-server",
  scope: "read",
  createdAt: "2026-04-01T10:00:00.000Z",
  expiresAt: null,
  lastUsedAt: null,
  ...overrides,
});

/** What the API answers, per test, so what a case depends on is in the case. */
const answerWith = (machineTokens: Record<string, unknown>[]): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/machine-tokens`, () =>
      HttpResponse.json({ machineTokens }),
    ),
    /*
     * The account sheet also holds the passkeys panel (ADR 19), which asks for
     * the list the moment the sheet opens. Declared here rather than left
     * unhandled because `setup.ts` is emphatic about it: a request no test
     * declared is a test that does not know what it depends on.
     */
    http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
  );
};

/**
 * Every value a `Storage` holds, as one string.
 *
 * `JSON.stringify(localStorage)` answers `undefined`: `Storage` keeps its
 * entries behind an index rather than as enumerable own properties, so the
 * obvious spelling of this assertion would pass against a storage full of
 * secrets.
 */
const everythingIn = (storage: Storage | undefined): string => {
  // `sessionStorage` is not always there under this jsdom build. A storage
  // that does not exist cannot be holding a secret, which is the answer this
  // assertion wants anyway.
  if (storage === undefined) {
    return "";
  }

  const values: string[] = [];
  for (let at = 0; at < storage.length; at += 1) {
    const key = storage.key(at);
    values.push(key ?? "", (key === null ? null : storage.getItem(key)) ?? "");
  }

  return values.join("\u0000");
};

/**
 * The panel is on a SCREEN now rather than in a sheet behind the top bar's
 * avatar: the account became the fifth destination when this client took the
 * phone's bar. Everything asserted below is unchanged; only the way in is.
 */
const openTheAccountScreen = async (): Promise<HTMLElement> => {
  renderApp({ route: "/you" });

  const heading = await screen.findByRole("heading", { name: /machine tokens/i });

  return heading.closest("section") as HTMLElement;
};

describe("machine tokens, from the account screen", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: [aTree(garage)] }),
      ),
    );
    answerWith([]);
  });

  describe("what exists", () => {
    it("says there are none yet, rather than showing an empty box", async () => {
      const account = await openTheAccountScreen();

      expect(
        await within(account).findByText(/no machine tokens yet/i),
      ).toBeVisible();
    });

    it("names every token that does exist", async () => {
      answerWith([
        aMachineTokenView({ name: "mcp-server" }),
        aMachineTokenView({ id: "mt2", name: "backup", scope: "read-write" }),
      ]);

      const account = await openTheAccountScreen();

      expect(await within(account).findByText("mcp-server")).toBeVisible();
      expect(within(account).getByText("backup")).toBeVisible();
    });

    /**
     * "read" and "read-write" are what the API stores and what the CLI prints.
     * Neither is a sentence, and the difference between them is the entire
     * point of the scope, so it is spelled out.
     */
    it("says what each one may do, in words rather than in the API's value", async () => {
      answerWith([
        aMachineTokenView({ name: "mcp-server", scope: "read" }),
        aMachineTokenView({ id: "mt2", name: "backup", scope: "read-write" }),
      ]);

      const account = await openTheAccountScreen();

      expect(await within(account).findByText(/read only/i)).toBeVisible();
      expect(within(account).getByText(/read and write/i)).toBeVisible();
    });

    /**
     * The column ADR 17 added the field for: a credential nobody can see being
     * used is one nobody will ever think to revoke.
     */
    it("says when each was last used, and says so plainly when it never was", async () => {
      answerWith([
        aMachineTokenView({ name: "mcp-server", lastUsedAt: null }),
        aMachineTokenView({
          id: "mt2",
          name: "backup",
          lastUsedAt: "2026-04-02T09:00:00.000Z",
        }),
      ]);

      const account = await openTheAccountScreen();

      expect(await within(account).findByText(/never used/i)).toBeVisible();
      expect(within(account).getByText(/last used/i)).toBeVisible();
    });

    it("never draws a control that revokes everything", async () => {
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");

      expect(
        within(account).queryByRole("button", { name: /revoke (all|every)/i }),
      ).toBeNull();
    });
  });

  describe("making one", () => {
    const createAnswering = (
      token: string,
      machineToken: Record<string, unknown> = aMachineTokenView(),
    ): void => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json({ token, machineToken }, { status: 201 }),
        ),
      );
    };

    const createOne = async (
      account: HTMLElement,
      name = "mcp-server",
    ): Promise<void> => {
      await userEvent.click(
        within(account).getByRole("button", { name: /new token/i }),
      );
      await userEvent.type(
        within(account).getByRole("textbox", { name: /what is it for/i }),
        name,
      );
      await userEvent.click(
        within(account).getByRole("button", { name: /create it/i }),
      );
    };

    it("sends the name and the scope that were chosen", async () => {
      let body: unknown;
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(
            { token: "wmk_secret", machineToken: aMachineTokenView() },
            { status: 201 },
          );
        }),
      );

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await userEvent.click(
        within(account).getByRole("button", { name: /new token/i }),
      );
      await userEvent.type(
        within(account).getByRole("textbox", { name: /what is it for/i }),
        "mcp-server",
      );
      await userEvent.selectOptions(
        within(account).getByRole("combobox", { name: /what it may do/i }),
        "read-write",
      );
      await userEvent.click(
        within(account).getByRole("button", { name: /create it/i }),
      );

      await waitFor(() => {
        expect(body).toEqual({ name: "mcp-server", scope: "read-write" });
      });
    });

    it("shows the secret it was given", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);

      expect(await within(account).findByText("wmk_the-only-copy")).toBeVisible();
    });

    /**
     * # The requirement, stated as a test
     *
     * A sentence that appears after the only copy of a credential is gone is
     * an epitaph. So the warning and the secret have to be on screen AT THE
     * SAME TIME, and the control that takes the secret away has to be the
     * thing that arrives last.
     *
     * This asserts all three together rather than one at a time, because any
     * one of them alone would pass on an interface that warned afterwards.
     */
    it("says it will never show it again while it is still showing it", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);

      const secret = await within(account).findByText("wmk_the-only-copy");
      const panel = secret.closest(".issued-secret");

      expect(panel).not.toBeNull();
      const shown = within(panel as HTMLElement);
      expect(shown.getByText(/only time you will see this/i)).toBeVisible();
      expect(shown.getByText(/cannot show it to you again/i)).toBeVisible();
      // The way to make it go away is inside the same panel as the warning,
      // so nobody can dismiss it without having been told.
      expect(shown.getByRole("button", { name: /i have stored it/i })).toBeVisible();
    });

    it("tells somebody how to present it, which is the next thing they need", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);

      expect(
        await within(account).findByText(/Authorization: Machine/i),
      ).toBeVisible();
    });

    /**
     * The clipboard is asserted by what the app HANDED it rather than by
     * reading it back: `testing/setup.ts` swaps in Node's `Blob` so that photo
     * uploads are real multipart requests, and `user-event`'s clipboard stub
     * reads its own entries back through a `FileReader` that will not accept
     * it. What matters here is the string the app tried to copy, and that is
     * exactly what this sees.
     */
    it("copies it, so nobody transcribes 43 random characters by eye", async () => {
      const copied: string[] = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            copied.push(value);
          },
        },
      });
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);
      await within(account).findByText("wmk_the-only-copy");

      await userEvent.click(within(account).getByRole("button", { name: /^copy$/i }));

      await waitFor(() => {
        expect(copied).toEqual(["wmk_the-only-copy"]);
      });
    });

    it("takes the secret away when it is dismissed", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);
      await within(account).findByText("wmk_the-only-copy");

      await userEvent.click(
        within(account).getByRole("button", { name: /i have stored it/i }),
      );

      await waitFor(() => {
        expect(within(account).queryByText("wmk_the-only-copy")).toBeNull();
      });
    });

    /**
     * A secret that survives leaving the screen is a secret in the DOM of a
     * screen somebody walked away from. It lives in component state and goes
     * with it — which is now proved by walking away, because the surface is a
     * destination rather than a sheet that closes.
     */
    it("does not bring the secret back when the screen is left and returned to", async () => {
      createAnswering("wmk_the-only-copy");
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await createOne(account);
      await within(account).findByText("wmk_the-only-copy");

      await userEvent.click(screen.getByRole("link", { name: /^places$/i }));
      await waitFor(() => {
        expect(screen.queryByText("wmk_the-only-copy")).toBeNull();
      });
      await userEvent.click(screen.getByRole("link", { name: /you, signed in as dario/i }));

      const reopened = (await screen.findByRole("heading", { name: /machine tokens/i })).closest(
        "section",
      ) as HTMLElement;
      await within(reopened).findByText("mcp-server");
      expect(within(reopened).queryByText("wmk_the-only-copy")).toBeNull();
    });

    /** Nothing writes it anywhere a later session could read it back. */
    it("never puts the secret in browser storage", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);
      await within(account).findByText("wmk_the-only-copy");

      expect(everythingIn(window.localStorage)).not.toContain("wmk_the-only-copy");
      expect(everythingIn(window.sessionStorage)).not.toContain("wmk_the-only-copy");
    });

    it("shows the new token in the list without being asked to refresh", async () => {
      createAnswering("wmk_the-only-copy");
      let listed = 0;
      apiServer.use(
        http.get(`${API_URL}/auth/machine-tokens`, () => {
          listed += 1;
          return HttpResponse.json({
            machineTokens: listed === 1 ? [] : [aMachineTokenView()],
          });
        }),
      );

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);

      expect(await within(account).findByText("mcp-server")).toBeVisible();
    });

    it("says which name is taken, in this app's words rather than the API's", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json(
            {
              error: {
                code: "MACHINE_TOKEN_NAME_ALREADY_TAKEN",
                message: 'A machine token named "mcp-server" already exists',
              },
            },
            { status: 409 },
          ),
        ),
      );

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);

      expect(
        await within(account).findByText(/there is already a machine token called/i),
      ).toBeVisible();
    });

    it("says what a usable name looks like when the API refuses one", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json(
            { error: { code: "INVALID_MACHINE_TOKEN_NAME", message: "no" } },
            { status: 422 },
          ),
        ),
      );

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account, "mcp server");

      // The same sentence is the field's own hint, so the refusal is found by
      // the box it lands in rather than by its words alone.
      const refusal = await within(account).findByRole("alert");
      expect(refusal).toHaveTextContent(/lower case letters, digits/i);
    });
  });

  describe("rotating one", () => {
    const rotateAnswering = (token: string): void => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens/:name/rotate`, () =>
          HttpResponse.json({ token, machineToken: aMachineTokenView() }),
        ),
      );
    };

    /**
     * There is no grace period (ADR 18), so the outage is the thing to say
     * BEFORE the button, not a surprise after it.
     */
    it("warns that the current secret stops working, before it does anything", async () => {
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^rotate$/i }),
      );

      expect(
        await within(account).findByText(/stops working the moment you do this/i),
      ).toBeVisible();
    });

    it("does nothing until it is confirmed", async () => {
      let rotated = 0;
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens/:name/rotate`, () => {
          rotated += 1;
          return HttpResponse.json({
            token: "wmk_next",
            machineToken: aMachineTokenView(),
          });
        }),
      );
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^rotate$/i }),
      );
      await within(account).findByText(/stops working the moment you do this/i);
      await userEvent.click(
        within(account).getByRole("button", { name: /cancel/i }),
      );

      expect(rotated).toBe(0);
    });

    it("shows the new secret with the same warning a creation gets", async () => {
      answerWith([aMachineTokenView()]);
      rotateAnswering("wmk_the-next-one");

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^rotate$/i }),
      );
      await within(account).findByText(/stops working the moment you do this/i);
      await userEvent.click(
        within(account).getByRole("button", { name: /rotate it/i }),
      );

      const secret = await within(account).findByText("wmk_the-next-one");
      const panel = within(secret.closest(".issued-secret") as HTMLElement);
      expect(panel.getByText(/only time you will see this/i)).toBeVisible();
    });

    /** Rotation is maintenance; it must not be a way to widen a key. */
    it("never offers a scope while rotating", async () => {
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^rotate$/i }),
      );
      await within(account).findByText(/stops working the moment you do this/i);

      expect(
        within(account).queryByRole("combobox", { name: /what it may do/i }),
      ).toBeNull();
    });
  });

  describe("revoking one", () => {
    it("warns what will stop working, before it does anything", async () => {
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^revoke$/i }),
      );

      expect(
        await within(account).findByText(/stops working on its very next request/i),
      ).toBeVisible();
    });

    it("does nothing until it is confirmed", async () => {
      let revoked = 0;
      apiServer.use(
        http.delete(`${API_URL}/auth/machine-tokens/:name`, () => {
          revoked += 1;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^revoke$/i }),
      );
      await within(account).findByText(/stops working on its very next request/i);
      await userEvent.click(within(account).getByRole("button", { name: /cancel/i }));

      expect(revoked).toBe(0);
    });

    it("takes the token off the list once it is gone", async () => {
      let listed = 0;
      apiServer.use(
        http.get(`${API_URL}/auth/machine-tokens`, () => {
          listed += 1;
          return HttpResponse.json({
            machineTokens: listed === 1 ? [aMachineTokenView()] : [],
          });
        }),
        http.delete(
          `${API_URL}/auth/machine-tokens/:name`,
          () => new HttpResponse(null, { status: 204 }),
        ),
      );

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^revoke$/i }),
      );
      await within(account).findByText(/stops working on its very next request/i);
      await userEvent.click(
        within(account).getByRole("button", { name: /revoke it/i }),
      );

      expect(
        await within(account).findByText(/no machine tokens yet/i),
      ).toBeVisible();
    });

    it("says a token was already gone rather than reporting a fault", async () => {
      answerWith([aMachineTokenView()]);
      apiServer.use(
        http.delete(`${API_URL}/auth/machine-tokens/:name`, () =>
          HttpResponse.json(
            { error: { code: "MACHINE_TOKEN_NOT_FOUND", message: "no such token" } },
            { status: 404 },
          ),
        ),
      );

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");
      await userEvent.click(
        within(account).getByRole("button", { name: /^revoke$/i }),
      );
      await within(account).findByText(/stops working on its very next request/i);
      await userEvent.click(
        within(account).getByRole("button", { name: /revoke it/i }),
      );

      expect(
        await within(account).findByText(/may already have been revoked/i),
      ).toBeVisible();
    });
  });

  /**
   * # Where to point the thing that is going to use it
   *
   * A secret on its own is half a credential. Somebody who has just made one
   * now has to find out which address to send it to, and the app knows that
   * answer exactly: it is the origin it was itself downloaded from (ADR 16).
   */
  describe("the address the calls go to", () => {
    it("is on the list before anybody has made a single token", async () => {
      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);

      expect(within(account).getByText("http://localhost:3000")).toBeVisible();
    });

    /**
     * The secret is shown once and is gone; the address is not a secret and
     * stays useful for ever. Somebody coming back a month later to rotate a
     * credential needs it THEN, which is a moment that has no issued-secret
     * panel in it.
     */
    it("is on the list beside the tokens that already exist", async () => {
      answerWith([aMachineTokenView()]);

      const account = await openTheAccountScreen();
      await within(account).findByText("mcp-server");

      expect(within(account).getByText("http://localhost:3000")).toBeVisible();
    });

    it("can be copied, because it is not a secret and gets typed into things", async () => {
      const copied: string[] = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            copied.push(value);
          },
        },
      });

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);

      await userEvent.click(
        within(account).getByRole("button", { name: /copy the address/i }),
      );

      await waitFor(() => {
        expect(copied).toEqual(["http://localhost:3000"]);
      });
    });
  });

  describe("moving the pair to where it will be used", () => {
    const createAnswering = (token: string): void => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json(
            { token, machineToken: aMachineTokenView() },
            { status: 201 },
          ),
        ),
      );
    };

    const createOne = async (account: HTMLElement): Promise<void> => {
      await userEvent.click(
        within(account).getByRole("button", { name: /new token/i }),
      );
      await userEvent.type(
        within(account).getByRole("textbox", { name: /what is it for/i }),
        "mcp-server",
      );
      await userEvent.click(
        within(account).getByRole("button", { name: /create it/i }),
      );
    };

    /**
     * The obvious consumer is `apps/mcp`, which reads these two variables and
     * nothing else. Offering them already assembled is what stops somebody
     * transcribing either half.
     */
    it("offers both settings in the shape the MCP server reads", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);

      const pair = await within(account).findByText(
        /WAYMARK_API_URL=http:\/\/localhost:3000/,
      );
      expect(pair).toHaveTextContent("WAYMARK_MACHINE_TOKEN=wmk_the-only-copy");
    });

    it("copies both at once, so neither half is retyped", async () => {
      const copied: string[] = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            copied.push(value);
          },
        },
      });
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);
      await within(account).findByText("wmk_the-only-copy");

      await userEvent.click(
        within(account).getByRole("button", { name: /copy both settings/i }),
      );

      await waitFor(() => {
        expect(copied).toEqual([
          "WAYMARK_API_URL=http://localhost:3000\nWAYMARK_MACHINE_TOKEN=wmk_the-only-copy",
        ]);
      });
    });

    /**
     * `Machine` is a scheme of its own (ADR 17), and the mistake anybody
     * wiring this up at one in the morning will make is `Bearer`. It is a
     * 401 that says nothing, so the sentence says it here instead.
     */
    it("says the scheme is Machine and not Bearer, without anybody reading an ADR", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);
      await within(account).findByText("wmk_the-only-copy");

      const how = within(account).getByText(/Authorization: Machine/i);
      expect(how).toHaveTextContent(/not .*Bearer/i);
    });

    /**
     * # The warning is still the first thing in the panel
     *
     * Everything added here sits BELOW the sentence that says the secret will
     * not be shown again. That warning is the only thing standing between
     * somebody and a credential they cannot get back, and a helpful block
     * that pushed it down the screen would be a worse panel than one with no
     * help in it at all.
     */
    it("keeps the warning ahead of everything it added", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);

      const secret = await within(account).findByText("wmk_the-only-copy");
      const panel = within(secret.closest(".issued-secret") as HTMLElement);
      const warning = panel.getByText(/cannot show it to you again/i);
      const pair = panel.getByText(/WAYMARK_MACHINE_TOKEN=/);

      // DOCUMENT_POSITION_FOLLOWING: the pair comes after the warning.
      expect(warning.compareDocumentPosition(pair) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
      expect(panel.getByText(/only time you will see this/i)).toBeVisible();
    });

    /**
     * The address and the credential are not the same kind of thing and must
     * not share a lifetime. Dismissing takes the secret — and the pair that
     * carries it — away; the address is still where it always was.
     */
    it("takes the pair away with the secret and leaves the address standing", async () => {
      createAnswering("wmk_the-only-copy");

      const account = await openTheAccountScreen();
      await within(account).findByText(/no machine tokens yet/i);
      await createOne(account);
      await within(account).findByText("wmk_the-only-copy");

      await userEvent.click(
        within(account).getByRole("button", { name: /i have stored it/i }),
      );

      await waitFor(() => {
        expect(within(account).queryByText(/WAYMARK_MACHINE_TOKEN=/)).toBeNull();
      });
      expect(within(account).getByText("http://localhost:3000")).toBeVisible();
    });
  });

  /** The way out is still there, underneath all of this. */
  /**
   * Sign out sits beside the tokens rather than inside their panel, so it is
   * looked for on the SCREEN. It was the thing the sheet existed for before the
   * tokens ever moved in, and a rearrangement of this surface must not lose it.
   */
  it("still carries the way out, which is what this surface existed for first", async () => {
    answerWith([aMachineTokenView()]);

    await openTheAccountScreen();

    expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible();
  });
});
