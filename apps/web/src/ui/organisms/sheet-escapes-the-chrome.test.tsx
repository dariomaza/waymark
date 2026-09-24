import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree, withPhoto } from "@waymark/api-client/testing";

import { sessionStore } from "../../auth/session-store.js";
import { apiServer, API_URL } from "../../testing/api-server.js";
import { renderApp, screen, userEvent, waitFor, within } from "../../testing/render-app.js";

/**
 * # The sheet was underneath the navigation, and `z-index` was never going to fix it
 *
 * A phone screenshot: the account sheet is open, and Sign out is cut in half
 * by the bottom navigation. Everything below that line is unreachable.
 *
 * The numbers say it should not be. `.sheet__backdrop` is `z-index: 20` and
 * `.bottom-nav` is `z-index: 10`, so the sheet wins — if those two numbers are
 * compared to each other at all, and they are not.
 *
 * ## What was actually happening
 *
 * `.app-bar` is `position: sticky` with `z-index: 10`, and a positioned
 * element with a `z-index` other than `auto` CREATES A STACKING CONTEXT. The
 * account sheet was handed to `AppBar` as its `actions`, so the whole sheet —
 * backdrop, panel, Sign out — rendered inside `<header class="app-bar">` and was
 * painted inside the app bar's stacking context. `z-index: 20` orders it
 * against the app bar's other children and against nothing else in the world.
 * `position: fixed` does not rescue it: a fixed descendant is still painted in
 * its ancestor's stacking context.
 *
 * So the comparison that actually decided the screenshot was between two
 * SIBLINGS in the root stacking context — `.app-bar` at `z-index: 10` and
 * `.bottom-nav` at `z-index: 10`. A tie, broken by document order, and the
 * navigation comes last in the shell. The navigation paints over the entire
 * header subtree, sheet included.
 *
 * Raising the sheet to `z-index: 100` would have changed nothing at all, and
 * raising the app bar to `z-index: 30` would have "fixed" it by putting the
 * TOP BAR above the navigation — leaving the real bug in place for the next
 * chrome element somebody adds.
 *
 * ## So the fix is structural, and so is this test
 *
 * A modal is not part of the chrome it was opened from. It is portalled to
 * `document.body`, where it is a sibling of the application root and its
 * `z-index` is finally compared against the navigation's.
 *
 * ## What this test can and cannot prove
 *
 * It proves the CAUSE: no ancestor of an open sheet can trap it, because it
 * has no ancestor but `<body>`. That is a fact about the DOM, it is exactly
 * what was wrong, and it fails on the code that produced the screenshot.
 *
 * It cannot prove the SYMPTOM. jsdom has no layout and no painting: it applies
 * none of these stylesheets, every `getBoundingClientRect` is zeros, and
 * "is Sign out covered by the navigation" is not a question it can be asked.
 * Nor can it say anything about the panel's height on a short phone, about
 * `dvh`, or about the on-screen keyboard — there is no visible viewport here
 * to shrink. Those were checked in a real browser and are written up in the
 * commit; what is guarded HERE is the structure that made them possible.
 *
 * A test asserting Sign out is in the document would pass on the broken code.
 * That is the test this one exists instead of.
 *
 * ## The reported instance no longer exists, and the guard stays
 *
 * The account sheet is gone: the account is the fifth destination in the bottom
 * bar now, because that is the shape the phone has and both clients live on the
 * owner's phone. So nothing in this app is opened from inside the header any
 * more, and the exact screenshot cannot recur.
 *
 * The CAUSE can. `.app-bar` is still sticky, still `z-index: 10`, still a
 * stacking context, and the next thing somebody hangs off it would be trapped
 * in it exactly as that sheet was. What is asserted below is therefore the
 * structure — no ancestor but `<body>` — for the sheets this app still opens,
 * from a screen sitting between two bars that both create one.
 */

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({ id: "box3", parentId: "garage", name: "Box 3" });

/** The chrome a sheet must not be trapped inside, by the classes that create it. */
const TRAPPING_ANCESTORS = [".app-shell", ".app-bar", ".screen", ".bottom-nav"];

describe("a sheet, wherever in the app it was opened from", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: [aTree(garage, [aTree(box)])] }),
      ),
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({ unit: withPhoto(box), path: [garage, box], children: [], items: [] }),
      ),
      /*
       * The account screen holds both kinds of credential a person manages
       * (ADR 18, ADR 19), and asks for each list the moment it is opened.
       * Declared here because `setup.ts` is emphatic about it: a request no
       * test declared is a test that does not know what it depends on.
       */
      http.get(`${API_URL}/auth/machine-tokens`, () =>
        HttpResponse.json({ machineTokens: [] }),
      ),
      http.get(`${API_URL}/auth/passkeys`, () => HttpResponse.json({ passkeys: [] })),
    );
  });

  /**
   * The home screen's own sheet, opened with both bars on screen. It stands in
   * for the account sheet that was reported: the header is still sticky, still
   * `z-index: 10` and still a stacking context, and the navigation is still its
   * sibling at the same number.
   */
  describe("a sheet opened with the chrome above and below it", () => {
    const openTheNewSpaceSheet = async (): Promise<HTMLElement> => {
      renderApp({ route: "/" });

      await userEvent.click(await screen.findByRole("button", { name: /add a space/i }));

      return await screen.findByRole("dialog");
    };

    /**
     * The regression, stated as the thing that was true on the phone: the
     * dialog was a descendant of the header, so nothing it could say about
     * its own `z-index` was ever compared with the navigation's.
     */
    it("is not drawn inside the top bar, which is still a stacking context", async () => {
      const panel = await openTheNewSpaceSheet();

      expect(document.querySelector(".app-bar")).not.toBeNull();
      expect(panel.closest(".app-bar")).toBeNull();
    });

    it("is not inside any element of the shell that could paint over it", async () => {
      const panel = await openTheNewSpaceSheet();

      for (const chrome of TRAPPING_ANCESTORS) {
        expect(panel.closest(chrome)).toBeNull();
      }
    });

    /**
     * The positive half. "Not inside the header" would also be satisfied by
     * moving the sheet next to the navigation, which would put it back in a
     * tie with it. Only `<body>` has no ancestor left to lose to.
     */
    it("hangs off the document body, where its z-index finally means something", async () => {
      const panel = await openTheNewSpaceSheet();

      const backdrop = panel.parentElement;

      expect(backdrop).toHaveClass("sheet__backdrop");
      expect(backdrop?.parentElement).toBe(document.body);
    });

    /**
     * The control at the BOTTOM of the panel is the one the screenshot cut in
     * half, so it is named rather than left to "something inside the dialog".
     */
    it("carries the control at its foot with it, out of the chrome", async () => {
      const panel = await openTheNewSpaceSheet();

      const submit = within(panel).getByRole("button", { name: /create/i });

      expect(submit.closest(".app-bar")).toBeNull();
      expect(submit.closest(".bottom-nav")).toBeNull();
    });

    /**
     * A panel rendered outside React's own container is a panel React has to
     * be trusted to take away again. One left behind would stack an invisible
     * backdrop over the app on every open, which is the failure mode a portal
     * introduces and the one worth a test.
     */
    it("takes the whole panel away again when it closes", async () => {
      await openTheNewSpaceSheet();

      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(document.querySelectorAll(".sheet__backdrop")).toHaveLength(0);
    });
  });

  /**
   * Every sheet in this app is the same component opened from inside `.screen`,
   * which happens not to create a stacking context TODAY — so they are one
   * `transform`, one `filter` or one `will-change` away from the same
   * screenshot, and the portal is theirs too. This one is two panels deep.
   */
  describe("a sheet opened from inside another sheet", () => {
    it("leaves the shell as well, rather than relying on the screen not trapping it", async () => {
      renderApp({ route: "/units/box3" });

      // Two panels deep now: the box's own menu, and Move from inside it. The
      // second one has to escape the chrome exactly as the first did — a
      // portal that only worked for the outermost sheet would fail here.
      await userEvent.click(await screen.findByRole("button", { name: "More actions for Box 3" }));
      await userEvent.click(await screen.findByRole("button", { name: /^move$/i }));
      const move = await screen.findByRole("dialog", { name: /move box 3/i });

      for (const chrome of TRAPPING_ANCESTORS) {
        expect(move.closest(chrome)).toBeNull();
      }
      expect(move.parentElement?.parentElement).toBe(document.body);
    });
  });
});
