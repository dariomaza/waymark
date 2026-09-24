import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { languageStore } from "./language.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, within } from "../testing/render-app.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });

describe("the frame every signed-in screen sits in", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: [aTree(garage)] }),
      ),
      /*
       * The account sheet holds both kinds of credential a person manages
       * (ADR 18, ADR 19), and asks for each list the moment it opens. Declared
       * here because `setup.ts` is emphatic about it: a request no test
       * declared is a test that does not know what it depends on.
       */
      http.get(`${API_URL}/auth/machine-tokens`, () =>
        HttpResponse.json({ machineTokens: [] }),
      ),
      http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
    );
  });

  /**
   * # The bar is the phone's bar now
   *
   * The owner had both clients open on one phone and the loudest difference on
   * the screen was down here: four tabs in one order plus an avatar in the top
   * bar, against five tabs in another order with the account among them. His
   * standing decision settles which way the convergence runs — both clients
   * live on his phone, so the phone's shape wins (ADR 22) — and this client
   * takes all of it.
   */
  describe("the navigation", () => {
    /**
     * Five destinations, icons with a small word under each. The word is what
     * makes an icon legible the FIRST time: a magnifier means search everywhere
     * in the world, but no shape in any vocabulary means "places" or "things",
     * so those two would otherwise have to be learned by tapping them.
     *
     * Which is also why the accessible name has to be the word rather than a
     * description of the drawing. A screen reader that announces "cube icon"
     * has described the shape and withheld the destination.
     */
    it("names every destination in a word, not in a picture", async () => {
      renderApp({ route: "/" });

      expect(await screen.findByRole("navigation", { name: /main/i })).toBeVisible();

      for (const name of [/^scan$/i, /^places$/i, /^search$/i, /^things$/i]) {
        expect(screen.getByRole("link", { name })).toBeVisible();
      }
      expect(screen.getByRole("link", { name: /you, signed in as dario/i })).toBeVisible();
    });

    /**
     * # Scan first, which is an argument this client is inheriting
     *
     * It was written in `apps/mobile/src/app/navigation.ts` and it was never
     * about React Native: "the product is a printed QR on a box and a phone
     * pointed at it; every tap between launching the app and the camera being
     * live is a tap taken in a garage, one-handed, holding something."
     *
     * The PWA is installed on that same phone. The argument reaches it
     * unchanged, so the order does too.
     */
    it("puts Scan first, because that is what the product is", async () => {
      renderApp({ route: "/" });

      await screen.findByRole("navigation", { name: /main/i });

      expect(
        within(screen.getByRole("navigation", { name: /main/i }))
          .getAllByRole("link")
          .map((link) => link.getAttribute("href")),
      ).toEqual(["/scan", "/", "/find", "/things", "/you"]);
    });

    it("says which destination you are already at", async () => {
      renderApp({ route: "/" });

      expect(await screen.findByRole("link", { name: /^places$/i })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    /**
     * The fifth destination is drawn as the person's own initial rather than as
     * a ninth icon: no shape in any vocabulary means "your account" — a
     * silhouette means "a person", which is the wrong person — and a circle with
     * your own initial in it is the one thing every product has already taught
     * everybody to read.
     */
    it("draws the account tab as the person's own initial", async () => {
      renderApp({ route: "/" });

      const you = await screen.findByRole("link", { name: /you, signed in as dario/i });

      expect(you).toHaveTextContent("D");
      expect(you).toHaveTextContent("You");
    });
  });

  describe("the top bar", () => {
    it("carries the product's name wherever you are", async () => {
      renderApp({ route: "/" });

      expect(await screen.findByRole("heading", { name: "Waymark" })).toBeVisible();
    });

    /**
     * # A line of chrome on the screen you look at most is rent
     *
     * "Signed in as dario" was printed above every single screen to answer a
     * question nobody asks twice in a household of one shared inventory (ADR 5).
     * It is not deleted, it is MOVED — first behind an avatar in this bar, and
     * now onto the account destination, where the phone has always kept it.
     */
    it("no longer spends a row of every screen saying who is signed in", async () => {
      renderApp({ route: "/" });

      await screen.findByRole("heading", { name: /your inventory/i });

      expect(screen.queryByText(/signed in as/i)).toBeNull();
    });

    /**
     * And it carries nothing that belongs to a person either. The avatar was up
     * here, opening a sheet; the phone has never had one in its bar, and the
     * owner's screenshots of the two bars side by side are what settled it. One
     * way to an account, on both clients, in the row where the thumb is.
     */
    it("carries nothing that belongs to a person rather than to the inventory", async () => {
      renderApp({ route: "/" });

      await screen.findByRole("heading", { name: "Waymark" });

      expect(screen.queryByRole("button", { name: /your account/i })).toBeNull();
      expect(screen.queryByRole("radio", { name: /español/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
    });
  });

  /**
   * # The account is a PLACE now, and the sheet argument is retired
   *
   * The sheet behind the avatar was argued for at length: what sits behind it
   * is a small group of controls about you rather than a list of commands, so
   * `role="menu"` was wrong; and a page of its own cost a navigation away from
   * the inventory and back, plus an address in an origin with one namespace to
   * spend (ADR 16), for two controls.
   *
   * Every sentence of that is still true and the conclusion is overruled
   * anyway, for a reason the argument never weighed: there are TWO clients on
   * the owner's phone, and the other one has always made this a destination. A
   * sheet here and a tab there is one account reached two ways, which is what
   * he was looking at when he said they read as two products.
   *
   * What it BUYS is the phone's own reasoning, unchanged: a destination gets
   * the back gesture, the router's focus handling and its announcement for
   * free, and this is a surface somebody arrives at, reads and leaves, rather
   * than a question being asked of them — which is what the sheets are for.
   *
   * The cost is the one the sheet argument named and it is now paid: one more
   * address, and a navigation away from the inventory and back. It is two taps
   * either way, which is why this was ever close.
   */
  describe("the account destination", () => {
    const openAccount = async (): Promise<void> => {
      renderApp({ route: "/" });

      await userEvent.click(
        await screen.findByRole("link", { name: /you, signed in as dario/i }),
      );

      await screen.findByRole("heading", { name: /^you$/i });
    };

    it("says who is signed in, which is where that sentence went", async () => {
      await openAccount();

      expect(screen.getByText(/signed in as dario/i)).toBeVisible();
    });

    it("holds the language and the way out", async () => {
      await openAccount();

      expect(screen.getByRole("radio", { name: /english/i })).toBeChecked();
      expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible();
    });

    /**
     * The one panel that exists on this client and not on the phone: the
     * devices that can open this account (ADR 19). Moving the surface must not
     * lose it, which is the failure a rearrangement makes easiest.
     */
    it("keeps the passkeys, which only this client has", async () => {
      await openAccount();

      expect(await screen.findByRole("heading", { name: /passkey/i })).toBeVisible();
    });

    /** Credentials for programs (ADR 18), which both clients have. */
    it("keeps the credentials handed to programs", async () => {
      await openAccount();

      expect(await screen.findByRole("heading", { name: /machine/i })).toBeVisible();
    });

    it("still lets the language be chosen, and remembers which one", async () => {
      await openAccount();

      const spanish = screen.getByRole("radio", { name: /español/i });
      const english = screen.getByRole("radio", { name: /english/i });
      expect(english).toBeChecked();

      await userEvent.click(spanish);

      expect(spanish).toBeChecked();
      expect(english).not.toBeChecked();
    });

    it("says it is the destination you are at", async () => {
      await openAccount();

      expect(screen.getByRole("link", { name: /you, signed in as dario/i })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  /**
   * # The switcher means something now
   *
   * It has been storing a choice since the day it shipped and translating
   * nothing. These are the tests that say the choice reaches the screen.
   */
  describe("the language the interface is in", () => {
    it("changes every word on screen the moment the choice changes", async () => {
      const user = userEvent.setup();
      renderApp({ route: "/" });

      await user.click(await screen.findByRole("link", { name: /you, signed in as dario/i }));
      await user.click(await screen.findByRole("radio", { name: /español/i }));

      expect(screen.getByRole("link", { name: "Lugares" })).toBeVisible();
      expect(screen.getByRole("link", { name: "Cosas" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    });

    /** The new surface is copy too: its tab's name, and its own heading. */
    it("names the account destination and its screen in the chosen language", async () => {
      languageStore.save("es");
      const user = userEvent.setup();
      renderApp({ route: "/" });

      const you = await screen.findByRole("link", {
        name: "Tú, sesión iniciada como dario",
      });

      await user.click(you);

      expect(await screen.findByRole("heading", { name: "Tú" })).toBeVisible();
    });

    /**
     * The point of storing the preference in the first place.
     *
     * A switcher that only works until you close the tab is a switcher that
     * makes somebody choose Spanish every morning. `renderApp` builds the
     * whole app from scratch against a store that already holds the choice,
     * which is exactly what a reload is.
     */
    it("opens in Spanish for somebody who chose Spanish the last time they were here", async () => {
      languageStore.save("es");
      const user = userEvent.setup();

      renderApp({ route: "/" });

      expect(await screen.findByRole("link", { name: "Lugares" })).toBeVisible();

      await user.click(screen.getByRole("link", { name: /tú, sesión iniciada como dario/i }));

      expect(await screen.findByRole("radio", { name: /español/i })).toBeChecked();
    });

    /**
     * Not decoration. A screen reader picks its voice and its pronunciation
     * rules from this attribute, and Spanish read aloud by an English
     * synthesiser is less intelligible than either language on its own —
     * which is the worst possible outcome for the person who most depends on
     * the words being right.
     */
    it("tells the browser which language the page is in", async () => {
      const user = userEvent.setup();
      renderApp({ route: "/" });

      expect(document.documentElement.lang).toBe("en");

      await user.click(await screen.findByRole("link", { name: /you, signed in as dario/i }));
      await user.click(await screen.findByRole("radio", { name: /español/i }));

      expect(document.documentElement.lang).toBe("es");
    });

    /** The nav's own accessible name is copy too — it is read out before the links inside it. */
    it("names the navigation itself in the chosen language", async () => {
      languageStore.save("es");

      renderApp({ route: "/" });

      expect(await screen.findByRole("navigation", { name: "Principal" })).toBeVisible();
    });

    /**
     * The product is called Waymark in both languages. A name is not a word
     * to be translated, and "Hilo" would be a different product.
     */
    it("leaves the product's own name alone", async () => {
      languageStore.save("es");

      renderApp({ route: "/" });

      expect(await screen.findByRole("heading", { name: "Waymark" })).toBeVisible();
    });
  });
});
