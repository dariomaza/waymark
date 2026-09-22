import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree } from "@ariadna/api-client/testing";

import { sessionStore } from "../auth/session-store.js";
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

    /**
     * The switcher is a real control from the start: it stores a choice and
     * reflects it, and it translates nothing yet. A decoration that looks like
     * a setting is worse than an absent one, because it invites somebody to
     * change something and then ignores them.
     */
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
});
