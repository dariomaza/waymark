import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../../auth/session-store.js";
import { apiServer, API_URL } from "../../testing/api-server.js";
import { aSession, aStorageUnit, aTree, withPhoto } from "@waymark/api-client/testing";
import { renderApp, screen, userEvent, waitFor, within } from "../../testing/render-app.js";

/**
 * # A sheet that says it is modal has to BE modal
 *
 * `aria-modal="true"` is a promise to a screen reader that nothing outside
 * the panel matters while it is open. A panel that only focuses itself keeps
 * that promise for about one keystroke: tab once past the last button and the
 * focus ring is on the page behind, reading a screen the person cannot see,
 * with no way back but the mouse they are not using.
 *
 * So the test is about the keyboard rather than about the attribute. It is
 * driven through the real app — the Move sheet on a real unit screen — for
 * the same reason every other test here is: the trap has to hold around the
 * controls a real sheet actually contains, not around a fixture.
 */

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({ id: "box3", parentId: "garage", name: "Box 3" });

const openTheMoveSheet = async (): Promise<HTMLElement> => {
  renderApp({ route: "/units/box3" });

  await userEvent.click(await screen.findByRole("button", { name: /^move$/i }));

  return await screen.findByRole("dialog", { name: /move box 3/i });
};

/** Every control a keyboard can reach inside the panel, in tab order. */
const focusableIn = (sheet: HTMLElement): HTMLElement[] => [
  ...sheet.querySelectorAll<HTMLElement>("button, select, a[href], input, textarea"),
];

describe("a sheet that is open", () => {
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
    );
  });

  it("starts with the focus on the panel itself", async () => {
    const sheet = await openTheMoveSheet();

    expect(sheet).toHaveFocus();
  });

  it("keeps the keyboard inside it, however many times Tab is pressed", async () => {
    const sheet = await openTheMoveSheet();
    const controls = focusableIn(sheet);
    expect(controls.length).toBeGreaterThan(1);

    // One more press than there are controls, so the wrap is exercised rather
    // than merely reached.
    for (let press = 0; press <= controls.length; press += 1) {
      await userEvent.tab();

      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("wraps from the last control back to the first", async () => {
    const sheet = await openTheMoveSheet();
    const controls = focusableIn(sheet);
    const last = controls.at(-1) as HTMLElement;

    last.focus();
    await userEvent.tab();

    expect(controls[0]).toHaveFocus();
  });

  it("wraps backwards from the first control to the last", async () => {
    const sheet = await openTheMoveSheet();
    const controls = focusableIn(sheet);

    controls[0]?.focus();
    await userEvent.tab({ shift: true });

    expect(controls.at(-1)).toHaveFocus();
  });

  it("never lets Tab reach the screen behind it", async () => {
    const sheet = await openTheMoveSheet();
    // The unit screen underneath has its own buttons; this is one of them.
    const behind = screen.getByRole("button", { name: /add an item/i });

    for (let press = 0; press < 12; press += 1) {
      await userEvent.tab();
    }

    expect(behind).not.toHaveFocus();
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
  });

  it("still closes on Escape, which shares the same listener as the trap", async () => {
    await openTheMoveSheet();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /move box 3/i })).toBeNull();
    });
  });

  /**
   * # The way out is a picture, and it is still called Close
   *
   * An X in the corner of a panel is one of the few shapes that needs no
   * caption anywhere in the world, and the word was costing a button's width
   * beside a title on a phone. What it may not cost is the NAME: an icon-only
   * control with nothing for a screen reader to read is a control somebody
   * can see and nobody else can find.
   *
   * So the assertion is both halves at once — no text, and a real name — and
   * it is made against the sheet every question in this app is asked with
   * rather than against a fixture.
   */
  it("closes with a picture that is still called Close", async () => {
    const sheet = await openTheMoveSheet();

    const close = within(sheet).getByRole("button", { name: /close/i });
    expect(close).toHaveAccessibleName("Close");
    expect(close).toHaveTextContent("");
  });

  it("hands the focus back to the button that opened it", async () => {
    const sheet = await openTheMoveSheet();
    const opener = screen.getByRole("button", { name: /^move$/i });

    await userEvent.click(within(sheet).getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });
});
