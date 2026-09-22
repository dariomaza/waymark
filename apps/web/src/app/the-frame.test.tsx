import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
import { languageStore } from "./language.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent } from "../testing/render-app.js";

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

      expect(await screen.findByRole("heading", { name: "Ariadna" })).toBeVisible();
    });

    it("offers a language, and remembers which one was chosen", async () => {
      const user = userEvent.setup();
      renderApp({ route: "/" });

      const spanish = await screen.findByRole("radio", { name: /español/i });
      const english = screen.getByRole("radio", { name: /english/i });
      expect(english).toBeChecked();

      await user.click(spanish);

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

      await user.click(await screen.findByRole("radio", { name: /español/i }));

      expect(screen.getByRole("link", { name: "Lugares" })).toBeVisible();
      expect(screen.getByRole("link", { name: "Cosas" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
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

      renderApp({ route: "/" });

      expect(await screen.findByRole("link", { name: "Lugares" })).toBeVisible();
      expect(screen.getByRole("radio", { name: /español/i })).toBeChecked();
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
     * The product is called Ariadna in both languages. A name is not a word
     * to be translated, and "Hilo" would be a different product.
     */
    it("leaves the product's own name alone", async () => {
      languageStore.save("es");

      renderApp({ route: "/" });

      expect(await screen.findByRole("heading", { name: "Ariadna" })).toBeVisible();
    });
  });
});
