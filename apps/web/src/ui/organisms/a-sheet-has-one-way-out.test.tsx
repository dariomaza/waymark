import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { aSession, aStorageUnit, aTree, withPhoto } from "@waymark/api-client/testing";
import { sessionStore } from "../../auth/session-store.js";
import { apiServer, API_URL } from "../../testing/api-server.js";
import { renderApp, screen, userEvent, within } from "../../testing/render-app.js";

/**
 * # Two ideas about how somebody leaves a dialog, and only one can be right
 *
 * Every sheet on this client ended with a two-up row: `Cancel` beside the
 * thing the sheet was for, at equal width and equal weight. Every sheet on the
 * phone ended with one full-width primary, and the X in the corner was the way
 * out. That is not a spacing difference, it is a different answer to "how do I
 * back out of this", and both clients are used by the same person on the same
 * phone.
 *
 * The phone's wins, and three arguments say so:
 *
 * 1. **The way out is already there, and it is already in one place.** Every
 *    sheet has the X in its head, and on this client Escape closes it and the
 *    backdrop is outside it. A `Cancel` button is a fourth spelling of a thing
 *    that already exists, and the one spelling that sits where a thumb aiming
 *    at Confirm can land.
 * 2. **It halves the primary.** The sheet exists for one action; giving away
 *    half the row makes "Guardar los cambios" wrap inside a 48px rectangle,
 *    which is the exact failure ADR 21 was written about, at two controls
 *    instead of nine.
 * 3. **Two rectangles side by side say they are the same kind of thing**, so a
 *    person reads both to find out which is which. ADR 21 ruled on that, and
 *    `Cancel` next to `Delete` is the worst instance of it in the product: the
 *    two controls that must never be confused, adjacent and identical.
 *
 * The cost is real and is named in ADR 22: on a desktop with a mouse, the way
 * out is now a small X in a corner rather than a button under the thumb, and
 * somebody who has half-filled a form has further to travel to abandon it.
 *
 * ## Why this is driven through the real app
 *
 * Because the claim is about what a person can do, and a fixture would prove
 * only that a component renders what it was handed. These are the sheets a
 * person actually opens.
 */
const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({ id: "box3", parentId: "garage", name: "Box 3" });

const setUpTheBox = (): void => {
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
};

const openTheMenuSheet = async (named: RegExp): Promise<HTMLElement> => {
  renderApp({ route: "/units/box3" });

  // The screen has to have arrived before its menu can be opened; without this
  // the first query races the unit request and times out on a loading state.
  await screen.findByRole("heading", { name: /box 3/i });

  await userEvent.click(await screen.findByRole("button", { name: "More actions for Box 3" }));
  await userEvent.click(await screen.findByRole("button", { name: named }));

  return await screen.findByRole("dialog");
};

/** The buttons a person can press inside the panel, in the order they appear. */
const controlsIn = (sheet: HTMLElement): string[] =>
  [...within(sheet).getAllByRole("button")].map((control) => control.textContent ?? "");

describe("a sheet that asks a question", () => {
  beforeEach(setUpTheBox);

  it("offers the thing it is for, and nothing standing beside it", async () => {
    const sheet = await openTheMenuSheet(/^delete$/i);

    expect(controlsIn(sheet).filter((label) => /cancel|leave it alone/i.test(label))).toEqual([]);
  });

  /**
   * The control. If the panel had come up empty, or the query had found the
   * wrong element, the assertion above would be green and mean nothing.
   */
  it("does offer the thing it is for, or the assertion above proves nothing", async () => {
    const sheet = await openTheMenuSheet(/^delete$/i);

    expect(controlsIn(sheet).some((label) => /delete/i.test(label))).toBe(true);
  });

  it("still has a way out, in the one place every sheet keeps it", async () => {
    const sheet = await openTheMenuSheet(/^delete$/i);

    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("and that way out actually closes it", async () => {
    const sheet = await openTheMenuSheet(/^delete$/i);

    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /**
   * A form is the case where backing out costs the most, so it is the one
   * worth stating: the X is the way out of a half-filled form too, exactly as
   * it is on the phone.
   */
  it("says the same about a form, which is where backing out costs most", async () => {
    const sheet = await openTheMenuSheet(/^edit$/i);

    expect(controlsIn(sheet).filter((label) => /cancel/i.test(label))).toEqual([]);
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

/**
 * # The guard, because two flows are not seven sheets
 *
 * The two tests above drive real screens, which is the only way to prove what
 * a person can actually do. They also cover exactly two of the seven sheets
 * this client has, and the first draft of this file was green with a `Cancel`
 * put back into a third — the item's own delete sheet, on a screen those flows
 * never visit. A test that passes while the thing it forbids is in the
 * codebase is worse than no test.
 *
 * So this names the rule rather than an instance of it: a file that draws a
 * sheet's footer offers no way out of its own, because the way out is the X
 * that every sheet already has. It catches the eighth sheet on the day it is
 * written, which is the point.
 */
const SRC = join(process.cwd(), "src");

const sourcesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "testing" ? [] : sourcesUnder(path);
    }

    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });

const footers = sourcesUnder(SRC)
  .map((path) => ({ path: relative(SRC, path), source: readFileSync(path, "utf8") }))
  .filter(({ source }) => source.includes('className="sheet__commit"'));

describe("every sheet in this client", () => {
  it("is more than the two the flows above open, or this guard is measuring nothing", () => {
    expect(footers.length).toBeGreaterThan(2);
  });

  it.each(footers.map(({ path }) => path))("offers no Cancel of its own, in %s", (path) => {
    const found = footers.find((footer) => footer.path === path);

    expect(found?.source).not.toContain('t("action.cancel")');
  });
});
