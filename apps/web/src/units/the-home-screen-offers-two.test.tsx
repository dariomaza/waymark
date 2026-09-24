import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { declarationsIn, drawn, pixels, sheet } from "../testing/drawn.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { renderApp, screen, userEvent } from "../testing/render-app.js";

/**
 * # Two buttons, on one line
 *
 * The owner, with the PWA and the APK side by side on his one phone:
 *
 * > la app no tiene las hojas de etiquetas y quería que fueran dos botones en
 * > línea.
 *
 * The screen had a full-width lime rectangle with a small `QuietLink` under it.
 * That shape was itself an answer to an earlier sentence of his (ADR 21's first
 * amendment), and this is the third: he wants the two ways off this screen
 * side by side.
 *
 * ## The failure this layout has to not repeat
 *
 * ADR 21 recorded `flex: 1 1 8rem` collapsing to one control per row the moment
 * the Spanish labels grew past the basis — "Añadir un espacio" and "Hoja de
 * etiquetas" are long — which is the single cramped column the comment beside
 * it had been written to prevent. A wrapping flex row cannot be asked not to
 * wrap; a two-track grid has nothing to wrap WITH, which is why it is a grid.
 */
const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });

const signedIn = (): void => {
  sessionStore.save(aSession());
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: [aTree(garage)] })),
  );
};

describe("the two ways off the home screen", () => {
  beforeEach(signedIn);

  it("offers adding a space and the sheet of labels, both at once", async () => {
    renderApp({ route: "/" });

    expect(await screen.findByRole("button", { name: /add a space/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /label sheet/i })).toBeVisible();
  });

  it("still opens the form for a new space", async () => {
    renderApp({ route: "/" });

    await userEvent.click(await screen.findByRole("button", { name: /add a space/i }));

    expect(await screen.findByRole("dialog")).toBeVisible();
  });

  it("still reaches the sheet, for a room that is not open yet", async () => {
    renderApp({ route: "/" });

    await userEvent.click(await screen.findByRole("link", { name: /label sheet/i }));

    expect(await screen.findByText(/tick the spaces you want labels for/i)).toBeVisible();
  });

  /**
   * The second control is a route, so it stays an `<a>` — it is a URL and it
   * belongs in the history — and it wears the same rectangle as the button
   * beside it, which is where it gets the 48px floor from.
   */
  it("makes the second one a real link, so it can be opened in its own tab", async () => {
    renderApp({ route: "/" });

    const toTheSheet = await screen.findByRole("link", { name: /label sheet/i });

    expect(toTheSheet).toHaveAttribute("href", "/labels");
    expect(toTheSheet).toHaveClass("button");
  });

  it("keeps a picture beside each word, so neither has to be read to be found", async () => {
    renderApp({ route: "/" });

    expect(
      (await screen.findByRole("button", { name: /add a space/i })).querySelector("svg"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /label sheet/i }).querySelector("svg")).toBeVisible();
  });
});

/**
 * # What happens at 360px, decided rather than discovered
 *
 * A grid of two equal tracks. The row cannot become two rows, because a grid
 * with two explicit columns has no wrapping to do — which is the whole reason
 * this is not the `flex: 1 1 8rem` ADR 21 threw away.
 *
 * At 360px, less this screen's two 16px gutters and an 8px gap, each track is
 * 156px. "Añadir un espacio" and "Hoja de etiquetas" do not fit on one line in
 * that, so both labels WRAP to two lines, and that is the deliberate choice:
 * the alternative is truncating a label or dropping below the tap floor, and a
 * wrapped label is legible where half a word is not. The longest single word in
 * either language is "etiquetas", which at 16px is comfortably inside a track
 * less its padding, so nothing overflows.
 *
 * Two lines inside a 48px rectangle still clears the floor, and the grid's own
 * stretch is what keeps both rectangles exactly the same height whatever each
 * label does — the failure ADR 22 named as "the one thing a row of peers must
 * not be" and fixed on the phone's button by taking its vertical padding away.
 * A flex row with `flex-wrap` could not promise that; a grid row does by
 * construction.
 */
const HOME = sheet("units/label-sheet-screen.css");
const BUTTON = sheet("ui/atoms/button.css");

describe("the row those two sit in", () => {
  const MARKUP = `
    <div class="inventory-screen__actions">
      <button class="button button--primary">Añadir un espacio</button>
      <a class="button button--secondary" href="/labels">Hoja de etiquetas</a>
    </div>`;

  it("is a grid of two tracks, which is a row that cannot become two rows", () => {
    const actions = drawn(MARKUP, ".inventory-screen__actions", { sheets: [HOME] });

    expect(actions.display).toBe("grid");
    expect(actions.gridTemplateColumns).toBe("1fr 1fr");
  });

  /**
   * Stated by NOT being overridden: a grid item fills its track's height unless
   * something tells it not to, and `align-items: start` is exactly the line
   * somebody would add while tidying. Read from the file, because the absence
   * of a declaration and a declaration of `normal` compute the same.
   */
  it("lets neither control sit shorter than the other", () => {
    expect(declarationsIn(HOME, ".inventory-screen__actions")).not.toContain("align-items");
  });

  /** The floor is the rectangle's, and the link wears the rectangle. */
  it("keeps both of them a thumb target", () => {
    expect(pixels(drawn(MARKUP, ".button--primary", { sheets: [BUTTON, HOME] }).minHeight)).toBe(48);
    expect(pixels(drawn(MARKUP, ".button--secondary", { sheets: [BUTTON, HOME] }).minHeight)).toBe(
      48,
    );
  });

  /**
   * The old shape, named so it cannot come back by accident. A column with
   * `align-items: flex-start` is what kept the quiet link small; a column is
   * also exactly what "one below the other" means, which is what the owner
   * asked to stop seeing.
   */
  it("is not the column it used to be", () => {
    expect(drawn(MARKUP, ".inventory-screen__actions", { sheets: [HOME] }).flexDirection).not.toBe(
      "column",
    );
  });
});
