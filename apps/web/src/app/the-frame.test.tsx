import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { languageStore } from "./language.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

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

  describe("the navigation", () => {
    /**
     * The four destinations are icons now, with a small word under each. The
     * word is what makes an icon legible the FIRST time: a magnifier means
     * search everywhere in the world, but no shape in any vocabulary means
     * "places" or "things", so those two would otherwise have to be learned.
     *
     * Which is also why the accessible name has to be the word rather than a
     * description of the drawing. A screen reader that announces "cube icon"
     * has described the shape and withheld the destination.
     */
    it("names every destination in a word, not in a picture", async () => {
      renderApp({ route: "/" });

      expect(await screen.findByRole("navigation", { name: /main/i })).toBeVisible();

      for (const name of [/places/i, /things/i, /search/i, /scan/i]) {
        expect(screen.getByRole("link", { name })).toBeVisible();
      }
    });

    it("says which destination you are already at", async () => {
      renderApp({ route: "/" });

      expect(await screen.findByRole("link", { name: /places/i })).toHaveAttribute(
        "aria-current",
        "page",
      );
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
     * "Signed in as dario" was printed above every single screen — the
     * inventory, a box, a search, the scanner — to answer a question nobody
     * asks twice in a household of one shared inventory (ADR 5). It is not
     * deleted, it is MOVED: it now lives behind the avatar, where the rest of
     * what belongs to you lives, and the avatar's own accessible name carries
     * it for anybody who cannot see the letter.
     */
    it("no longer spends a row of every screen saying who is signed in", async () => {
      renderApp({ route: "/" });

      await screen.findByRole("heading", { name: /your inventory/i });

      expect(screen.queryByText(/signed in as/i)).toBeNull();
    });

    it("carries the person's own initial instead", async () => {
      renderApp({ route: "/" });

      const avatar = await screen.findByRole("button", {
        name: /your account, signed in as dario/i,
      });

      expect(avatar).toBeVisible();
      expect(avatar).toHaveTextContent("D");
    });

    /**
     * The switcher used to sit in the bar beside Sign out. It is about YOU
     * and not about the inventory, so it went behind the avatar with
     * everything else that is.
     */
    it("keeps the language choice behind the avatar rather than in the bar", async () => {
      const user = userEvent.setup();
      renderApp({ route: "/" });

      await screen.findByRole("heading", { name: /your inventory/i });
      expect(screen.queryByRole("radio", { name: /español/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();

      await user.click(screen.getByRole("button", { name: /your account/i }));

      expect(await screen.findByRole("radio", { name: /español/i })).toBeVisible();
      expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible();
    });
  });

  /**
   * # Why the avatar opens a dialog and not a menu
   *
   * What is behind it is a small GROUP OF CONTROLS about you — who you are,
   * which language you read, and the way out — rather than a list of commands
   * to pick one of. That rules out `role="menu"`: a menu promises arrow keys,
   * Home and End and typeahead, and its children have to be menu items, so
   * the language switcher would have to be rebuilt out of `menuitemradio` and
   * lose the real radio group it deliberately is. Rewriting a working,
   * accessible control to satisfy a role name is the wrong trade.
   *
   * A page was the other option and costs a navigation away from the
   * inventory and back, plus one more address in an origin that now has only
   * one namespace to spend (ADR 16), for two controls.
   *
   * So it is the `Sheet` this app already asks every other question with. It
   * is `role="dialog"` with `aria-modal="true"`, it is labelled by its own
   * title, it takes the focus on open, it traps Tab, Escape closes it and the
   * focus goes back to the control that opened it — all of which is already
   * true and already tested (`sheet-focus.test.tsx`). It comes up from the
   * bottom for the same reason the navigation is down there: that is where
   * the thumb already is.
   */
  describe("what the avatar opens", () => {
    const openAccount = async (): Promise<HTMLElement> => {
      renderApp({ route: "/" });

      await userEvent.click(
        await screen.findByRole("button", { name: /your account/i }),
      );

      return await screen.findByRole("dialog", { name: /your account/i });
    };

    it("is a modal dialog, and says so to a screen reader", async () => {
      const account = await openAccount();

      expect(account).toHaveAttribute("aria-modal", "true");
    });

    it("says who is signed in, which is where that sentence went", async () => {
      const account = await openAccount();

      expect(within(account).getByText(/signed in as dario/i)).toBeVisible();
    });

    it("holds the language and the way out", async () => {
      const account = await openAccount();

      expect(within(account).getByRole("radio", { name: /english/i })).toBeChecked();
      expect(within(account).getByRole("button", { name: /sign out/i })).toBeVisible();
    });

    it("takes the focus when it opens, so the keyboard is already inside it", async () => {
      const account = await openAccount();

      expect(account).toHaveFocus();
    });

    it("closes on Escape and hands the focus back to the avatar", async () => {
      await openAccount();
      const avatar = screen.getByRole("button", { name: /your account/i });

      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: /your account/i })).toBeNull();
      });
      expect(avatar).toHaveFocus();
    });

    it("still lets the language be chosen, and remembers which one", async () => {
      const account = await openAccount();

      const spanish = within(account).getByRole("radio", { name: /español/i });
      const english = within(account).getByRole("radio", { name: /english/i });
      expect(english).toBeChecked();

      await userEvent.click(spanish);

      expect(spanish).toBeChecked();
      expect(english).not.toBeChecked();
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

      await user.click(await screen.findByRole("button", { name: /your account/i }));
      await user.click(await screen.findByRole("radio", { name: /español/i }));

      expect(screen.getByRole("link", { name: "Lugares" })).toBeVisible();
      expect(screen.getByRole("link", { name: "Cosas" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    });

    /** The new surface is copy too: its title, and the avatar's own name. */
    it("names the avatar and what it opens in the chosen language", async () => {
      languageStore.save("es");
      const user = userEvent.setup();
      renderApp({ route: "/" });

      const avatar = await screen.findByRole("button", {
        name: "Tu cuenta, sesión iniciada como dario",
      });

      await user.click(avatar);

      expect(await screen.findByRole("dialog", { name: "Tu cuenta" })).toBeVisible();
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

      await user.click(screen.getByRole("button", { name: /tu cuenta/i }));

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

      await user.click(await screen.findByRole("button", { name: /your account/i }));
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
