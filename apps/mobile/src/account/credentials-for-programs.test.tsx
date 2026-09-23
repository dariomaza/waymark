import { aSession } from "@waymark/api-client/testing";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fakeClipboard } from "../testing/fake-clipboard.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # Credentials for programs, from a phone
 *
 * ADR 17 made machine tokens and gave them to a shell; ADR 18 gave them to
 * the web client's account sheet, because a credential nobody can SEE is a
 * credential nobody revokes. A phone is where somebody actually is when they
 * decide a credential has leaked, and until now it was the one client that
 * could not do anything about it.
 *
 * Two things carry this screen. The SECRET exists exactly once, in exactly
 * one response, and is gone the moment this screen is — so the copy has to
 * happen while it is still drawn, which on a phone means a clipboard rather
 * than a person retyping 43 random characters standing up. The ADDRESS is the
 * opposite kind of thing: it is not a secret, it is the other half of the
 * credential, and it stays on the list long after the secret has gone.
 */
const aMachineTokenView = (overrides: Record<string, unknown> = {}): unknown => ({
  id: "mt1",
  name: "mcp-server",
  scope: "read",
  createdAt: "2026-04-01T10:00:00.000Z",
  expiresAt: null,
  lastUsedAt: null,
  ...overrides,
});

const theApiHolds = (machineTokens: readonly unknown[]): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/machine-tokens`, () =>
      HttpResponse.json({ machineTokens }),
    ),
  );
};

const openYourAccount = async (): Promise<void> => {
  await screen.findByText(/scan a label/i);
  await fireEvent.press(screen.getByRole("button", { name: "You, signed in as dario" }));
  await screen.findByText("Signed in as dario");
};

describe("machine tokens, from the phone", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
    theApiHolds([]);
  });

  describe("what exists", () => {
    it("says there are none yet rather than drawing an empty box", async () => {
      await renderApp({ session: aSession() });
      await openYourAccount();

      expect(await screen.findByText(/no machine tokens yet/i)).toBeOnTheScreen();
    });

    it("names every credential that does exist, and what each may do", async () => {
      theApiHolds([
        aMachineTokenView({ name: "mcp-server", scope: "read" }),
        aMachineTokenView({ id: "mt2", name: "backup", scope: "read-write" }),
      ]);

      await renderApp({ session: aSession() });
      await openYourAccount();

      expect(await screen.findByText("mcp-server")).toBeOnTheScreen();
      expect(screen.getByText("backup")).toBeOnTheScreen();
      expect(screen.getByText("Read only")).toBeOnTheScreen();
      expect(screen.getByText("Read and write")).toBeOnTheScreen();
    });

    /**
     * The column somebody came for. A credential nobody can see being used is
     * one nobody will ever dare revoke.
     */
    it("says when each was last used, and says so plainly when it never was", async () => {
      theApiHolds([
        aMachineTokenView({ name: "mcp-server", lastUsedAt: null }),
        aMachineTokenView({ id: "mt2", name: "backup", lastUsedAt: "2026-05-02T09:00:00.000Z" }),
      ]);

      await renderApp({ session: aSession() });
      await openYourAccount();

      expect(await screen.findByText("Never used")).toBeOnTheScreen();
      expect(screen.getByText(/^Last used /)).toBeOnTheScreen();
    });
  });

  /**
   * # The half of a credential that is not a secret
   *
   * Explicit owner feedback: a token on its own is half an answer. On the web
   * the address comes from `window.location`; a phone has no document, so the
   * truthful source is the base URL this app was built to call — which is the
   * same string every request in the app already goes to.
   */
  describe("where to point it", () => {
    it("shows the address the credentials are presented to", async () => {
      await renderApp({ session: aSession() });
      await openYourAccount();

      expect(await screen.findByLabelText("The address of this Waymark")).toBeOnTheScreen();
      expect(screen.getByText(API_URL)).toBeOnTheScreen();
    });

    it("keeps the address on the list, where no secret is on screen", async () => {
      theApiHolds([aMachineTokenView({ name: "mcp-server" })]);
      const clipboard = fakeClipboard();

      await renderApp({ session: aSession(), clipboard });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "Copy the address" }));

      await waitFor(() => {
        expect(clipboard.copied).toEqual([API_URL]);
      });
    });
  });

  describe("making one", () => {
    const theApiIssues = (secret: string, name = "mcp-server"): readonly unknown[] => {
      const asked: unknown[] = [];

      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, async ({ request }) => {
          asked.push(await request.json());

          return HttpResponse.json({
            token: secret,
            machineToken: aMachineTokenView({ name }),
          });
        }),
      );

      return asked;
    };

    it("sends the name and the scope that were chosen", async () => {
      const asked = theApiIssues("wmk_secret");

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "backup");
      await fireEvent.press(screen.getByRole("radio", { name: "Read and write" }));
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      await waitFor(() => {
        expect(asked).toEqual([{ name: "backup", scope: "read-write" }]);
      });
    });

    it("shows the secret, and says it will never show it again while it still is", async () => {
      theApiIssues("wmk_the_only_copy");

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "mcp-server");
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      expect(await screen.findByText("wmk_the_only_copy")).toBeOnTheScreen();
      expect(screen.getByText(/only time you will see this/i)).toBeOnTheScreen();
    });

    /**
     * The whole reason a phone needed this screen rather than a shell. The
     * alternative is transcribing 43 random base64url characters by eye,
     * getting one wrong, and reaching for a screenshot — which is a permanent
     * file in a library that syncs, rather than a clipboard entry the next
     * copy replaces.
     */
    it("copies the secret, so nobody transcribes it by eye", async () => {
      theApiIssues("wmk_the_only_copy");
      const clipboard = fakeClipboard();

      await renderApp({ session: aSession(), clipboard });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "mcp-server");
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      await fireEvent.press(await screen.findByRole("button", { name: "Copy" }));

      await waitFor(() => {
        expect(clipboard.copied).toEqual(["wmk_the_only_copy"]);
      });
      expect(await screen.findByRole("button", { name: "Copied" })).toBeOnTheScreen();
    });

    /** The address and the secret together, in the shape `apps/mcp` reads. */
    it("copies the address and the secret as the pair a program needs", async () => {
      theApiIssues("wmk_the_only_copy");
      const clipboard = fakeClipboard();

      await renderApp({ session: aSession(), clipboard });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "mcp-server");
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      await fireEvent.press(await screen.findByRole("button", { name: "Copy both settings" }));

      await waitFor(() => {
        expect(clipboard.copied).toEqual([
          `WAYMARK_API_URL=${API_URL}\nWAYMARK_MACHINE_TOKEN=wmk_the_only_copy`,
        ]);
      });
    });

    it("says when a copy could not be made, rather than doing nothing", async () => {
      theApiIssues("wmk_the_only_copy");
      const clipboard = fakeClipboard();
      clipboard.refuses();

      await renderApp({ session: aSession(), clipboard });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "mcp-server");
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      await fireEvent.press(await screen.findByRole("button", { name: "Copy" }));

      expect(await screen.findByText(/would not copy it/i)).toBeOnTheScreen();
    });

    it("takes the secret away when it is dismissed, and does not bring it back", async () => {
      theApiIssues("wmk_the_only_copy");

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "mcp-server");
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      await fireEvent.press(await screen.findByRole("button", { name: "I have stored it" }));

      await waitFor(() => {
        expect(screen.queryByText("wmk_the_only_copy")).toBeNull();
      });
    });

    it("shows the new credential on the list without being asked to refresh", async () => {
      let issued = false;
      apiServer.use(
        http.get(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json({
            machineTokens: issued ? [aMachineTokenView({ name: "mcp-server" })] : [],
          }),
        ),
        http.post(`${API_URL}/auth/machine-tokens`, () => {
          issued = true;

          return HttpResponse.json({
            token: "wmk_x",
            machineToken: aMachineTokenView({ name: "mcp-server" }),
          });
        }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "mcp-server");
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      expect(await screen.findByText("mcp-server")).toBeOnTheScreen();
    });

    it("says which name is taken, in this app's words rather than the API's", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens`, () =>
          HttpResponse.json(
            {
              error: {
                code: "MACHINE_TOKEN_NAME_ALREADY_TAKEN",
                message: "machine token mcp-server already exists",
                details: { machineTokenName: "mcp-server" },
              },
            },
            { status: 409 },
          ),
        ),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "New token" }));
      await fireEvent.changeText(screen.getByLabelText("What is it for"), "mcp-server");
      await fireEvent.press(screen.getByRole("button", { name: "Create it" }));

      expect(
        await screen.findByText("There is already a machine token called mcp-server."),
      ).toBeOnTheScreen();
    });
  });

  describe("rotating one", () => {
    beforeEach(() => {
      theApiHolds([aMachineTokenView({ name: "mcp-server" })]);
    });

    it("warns that the current secret stops working, before it does anything", async () => {
      let rotated = false;
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens/mcp-server/rotate`, () => {
          rotated = true;

          return HttpResponse.json({
            token: "wmk_new",
            machineToken: aMachineTokenView({ name: "mcp-server" }),
          });
        }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "Rotate" }));

      expect(await screen.findByText(/stops working the moment you do this/i)).toBeOnTheScreen();
      expect(rotated).toBe(false);
    });

    it("shows the new secret with the same warning a creation gets", async () => {
      apiServer.use(
        http.post(`${API_URL}/auth/machine-tokens/mcp-server/rotate`, () =>
          HttpResponse.json({
            token: "wmk_rotated",
            machineToken: aMachineTokenView({ name: "mcp-server" }),
          }),
        ),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "Rotate" }));
      await fireEvent.press(await screen.findByRole("button", { name: "Rotate it" }));

      expect(await screen.findByText("wmk_rotated")).toBeOnTheScreen();
      expect(screen.getByText(/only time you will see this/i)).toBeOnTheScreen();
    });
  });

  describe("revoking one", () => {
    beforeEach(() => {
      theApiHolds([aMachineTokenView({ name: "mcp-server" })]);
    });

    it("warns what will stop working, and does nothing until it is confirmed", async () => {
      let revoked = false;
      apiServer.use(
        http.delete(`${API_URL}/auth/machine-tokens/mcp-server`, () => {
          revoked = true;

          return HttpResponse.empty({ status: 204 });
        }),
      );

      await renderApp({ session: aSession() });
      await openYourAccount();

      await fireEvent.press(await screen.findByRole("button", { name: "Revoke" }));

      expect(
        await screen.findByText(/stops working on its very next request/i),
      ).toBeOnTheScreen();
      expect(revoked).toBe(false);

      await fireEvent.press(screen.getByRole("button", { name: "Revoke it" }));

      await waitFor(() => {
        expect(revoked).toBe(true);
      });
    });
  });

  describe("in Spanish", () => {
    it("says the whole panel in the language on screen", async () => {
      await renderApp({ session: aSession(), language: "es" });

      await screen.findByText(/escanear una etiqueta/i);
      await fireEvent.press(
        screen.getByRole("button", { name: "Tú, sesión iniciada como dario" }),
      );

      expect(await screen.findByText("Tokens de máquina")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Nuevo token" })).toBeOnTheScreen();
    });
  });
});
