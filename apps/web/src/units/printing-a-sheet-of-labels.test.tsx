import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";
import type { StorageUnitTreeView, StorageUnitView } from "@waymark/api-client";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { LABELS_PER_PAGE } from "./views/label-sheet.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { aQrSvg, decodeQrSvg } from "../testing/qr-fixture.js";
import { renderApp, screen, userEvent, waitFor, within } from "../testing/render-app.js";

/**
 * # Labelling a storage room in one afternoon
 *
 * The product is a printed QR on a box, and until now it was printed one at a
 * time: open the box's screen, open its label, print, go back, repeat sixty
 * times. Which means it never happened, and a room of unlabelled boxes is the
 * labyrinth this app is named after failing to have a thread.
 *
 * The sheet is therefore tested as the workflow: pick the units, get a page,
 * cut, stick. The two things that would waste an afternoon and a sheet of
 * stickers are (1) the wrong units on the page and (2) the right names next
 * to the wrong symbols — twelve QR squares look identical — so both are
 * pinned, and the symbols are decoded rather than counted.
 */

/** What the API's `WAYMARK_PUBLIC_BASE_URL` is in these tests. */
const PUBLIC_BASE_URL = "https://ariadna.example";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const wardrobe = aStorageUnit({
  id: "wardrobe",
  parentId: "garage",
  name: "Metal wardrobe",
  kind: "FURNITURE",
  publicId: "WARDROBE01",
});
const box3 = aStorageUnit({
  id: "box3",
  parentId: "wardrobe",
  name: "Box 3",
  publicId: "7ZK3QWERTY",
});
const box4 = aStorageUnit({
  id: "box4",
  parentId: "wardrobe",
  name: "Box 4",
  publicId: "QQ11223344",
});
const shed = aStorageUnit({ id: "shed", name: "Shed", kind: "ROOM", publicId: "SHED000001" });

const theForest = (): readonly StorageUnitTreeView[] => [
  aTree(garage, [aTree(wardrobe, [aTree(box3), aTree(box4)])]),
  aTree(shed),
];

/** The symbol the API would render for a unit: a real QR of a real URL. */
const symbolFor = (unit: StorageUnitView): string =>
  aQrSvg(`${PUBLIC_BASE_URL}/u/${unit.publicId}`);

/**
 * Every `Blob` the app handed to the DOM, by the object URL it got back.
 *
 * The bytes an `<img>` is pointed at are the only place the pairing of a
 * symbol with a label can be checked, and jsdom has no object URLs of its own
 * (see `testing/setup.ts`), so they are recorded on the way past.
 */
const drawnBytes = new Map<string, Blob>();

const signedInWithTheForest = (units: readonly StorageUnitView[]): void => {
  sessionStore.save(aSession());
  drawnBytes.clear();

  let objectUrls = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:ariadna/recorded/${String((objectUrls += 1))}`;
    drawnBytes.set(url, blob as Blob);

    return url;
  });

  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/storage-units`, () => HttpResponse.json({ tree: theForest() })),
    ...units.map((unit) =>
      http.get(`${API_URL}/storage-units/${unit.id}/qr.svg`, () =>
        HttpResponse.text(symbolFor(unit), {
          headers: { "content-type": "image/svg+xml" },
        }),
      ),
    ),
  );
};

const theSheet = async (): Promise<HTMLElement> =>
  await screen.findByRole("region", { name: /label sheet/i });

const labelsOn = (sheet: HTMLElement): HTMLElement[] => [
  ...sheet.querySelectorAll<HTMLElement>("[data-label-for]"),
];

/** The URL encoded in the symbol actually drawn on a label. */
const symbolOn = async (label: HTMLElement): Promise<string> => {
  const image = within(label).getByRole("img");
  const bytes = drawnBytes.get(image.getAttribute("src") ?? "");
  if (bytes === undefined) {
    throw new Error("that label is not showing a symbol at all");
  }

  return decodeQrSvg(await bytes.text());
};

const tick = async (name: string | RegExp): Promise<void> => {
  await userEvent.click(await screen.findByRole("checkbox", { name }));
};

describe("a sheet of labels for a whole storage room", () => {
  beforeEach(() => {
    signedInWithTheForest([garage, wardrobe, box3, box4, shed]);
  });

  it("starts with nothing picked, and says so rather than showing a blank page", async () => {
    renderApp({ route: "/labels" });

    expect(await screen.findByText(/tick the units you want labels for/i)).toBeVisible();
    expect(screen.queryByRole("region", { name: /label sheet/i })).toBeNull();
  });

  it("puts exactly the ticked units on the page, in the order the tree is drawn", async () => {
    renderApp({ route: "/labels" });

    await tick(/^box 4$/i);
    await tick(/^box 3$/i);

    const labels = labelsOn(await theSheet());
    expect(labels.map((label) => label.dataset["labelFor"])).toEqual(["box3", "box4"]);
  });

  it("unticks as easily as it ticks, because sixty boxes means mistakes", async () => {
    renderApp({ route: "/labels" });

    await tick(/^box 3$/i);
    await tick(/^box 4$/i);
    await tick(/^box 3$/i);

    expect(labelsOn(await theSheet()).map((label) => label.dataset["labelFor"])).toEqual([
      "box4",
    ]);
  });

  /**
   * The whole point of ADR 1: a location IS a storage unit, so "every box in
   * the garage" is one tick rather than sixty. Without this the sheet is a
   * faster version of the same chore.
   */
  it("takes a whole subtree in one press", async () => {
    renderApp({ route: "/labels" });

    await userEvent.click(
      await screen.findByRole("button", { name: /everything inside garage/i }),
    );

    expect(labelsOn(await theSheet()).map((label) => label.dataset["labelFor"])).toEqual([
      "wardrobe",
      "box3",
      "box4",
    ]);
  });

  /**
   * `?within=` means the same here as it does on a search (ADR 11): a box is
   * not inside itself. The room is one tick away if somebody wants it.
   */
  it("arrives from a unit with everything inside it already picked", async () => {
    renderApp({ route: "/labels?within=garage" });

    expect(labelsOn(await theSheet()).map((label) => label.dataset["labelFor"])).toEqual([
      "wardrobe",
      "box3",
      "box4",
    ]);
    expect(screen.getByRole("checkbox", { name: /^garage$/i })).not.toBeChecked();
  });

  it("is reachable from the unit whose contents are being labelled", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/garage`, () =>
        HttpResponse.json({
          unit: { ...garage, photo: null },
          path: [garage],
          children: [wardrobe],
          items: [],
        }),
      ),
    );

    renderApp({ route: "/units/garage" });

    await userEvent.click(await screen.findByRole("link", { name: /label sheet/i }));

    expect(labelsOn(await theSheet()).map((label) => label.dataset["labelFor"])).toEqual([
      "wardrobe",
      "box3",
      "box4",
    ]);
  });

  it("is reachable from the home screen, for a room that is not open yet", async () => {
    renderApp({ route: "/" });

    await userEvent.click(await screen.findByRole("link", { name: /label sheet/i }));

    expect(await screen.findByText(/tick the units you want labels for/i)).toBeVisible();
  });
});

describe("what is printed on one label", () => {
  beforeEach(() => {
    signedInWithTheForest([garage, wardrobe, box3, box4, shed]);
  });

  /**
   * The reason a label is not just a QR. Standing in front of twenty boxes, a
   * wall of identical squares means scanning every one of them; a name means
   * reading the wall.
   */
  it("carries the name, readable without a phone", async () => {
    renderApp({ route: "/labels" });
    await tick(/^box 3$/i);

    const [label] = labelsOn(await theSheet());
    expect(within(label as HTMLElement).getByText("Box 3")).toBeVisible();
  });

  /**
   * Ten characters of Crockford Base32, which is what `publicId` is FOR: a
   * scuffed label past what level Q can recover still has a code somebody can
   * read out loud across a garage.
   */
  it("carries the code, for the day the symbol is too scuffed to scan", async () => {
    renderApp({ route: "/labels" });
    await tick(/^box 3$/i);

    const [label] = labelsOn(await theSheet());
    expect(within(label as HTMLElement).getByText("7ZK3QWERTY")).toBeVisible();
  });

  /**
   * Not for the person holding the box — they can see where they are. For the
   * ten minutes between the printer and the glue, when twelve cut-out squares
   * have to be matched to twelve boxes, three of which are called `Box 3`.
   */
  it("carries where the unit lives, which is what tells two Box 3s apart", async () => {
    renderApp({ route: "/labels" });
    await tick(/^box 3$/i);

    const [label] = labelsOn(await theSheet());
    expect(
      within(label as HTMLElement).getByText("Garage > Metal wardrobe"),
    ).toBeVisible();
  });

  it("says nothing about where a root unit lives, because there is nothing to say", async () => {
    renderApp({ route: "/labels" });
    await tick(/^shed$/i);

    const [label] = labelsOn(await theSheet());
    expect(within(label as HTMLElement).queryByText(">")).toBeNull();
    expect(within(label as HTMLElement).getByText("Shed")).toBeVisible();
  });

  /**
   * A kind is deliberately absent. "Box" on a label stuck to a box is a word
   * that costs space on every label and disambiguates nothing a person
   * looking at the thing cannot already see.
   */
  it("leaves the kind off, because the object is in front of you", async () => {
    renderApp({ route: "/labels" });
    await tick(/^metal wardrobe$/i);

    const [label] = labelsOn(await theSheet());
    expect(within(label as HTMLElement).queryByText(/furniture/i)).toBeNull();
  });
});

describe("the symbol on each label", () => {
  beforeEach(() => {
    signedInWithTheForest([garage, wardrobe, box3, box4, shed]);
  });

  /**
   * A URL and not a bare id, because Android's stock camera offers to OPEN a
   * URL and merely offers to copy a string — which is the whole reason the
   * printed label exists.
   */
  it("encodes the address of that box, decoded rather than counted", async () => {
    renderApp({ route: "/labels" });
    await tick(/^box 3$/i);

    const [label] = labelsOn(await theSheet());
    await waitFor(async () => {
      await expect(symbolOn(label as HTMLElement)).resolves.toBe(
        `${PUBLIC_BASE_URL}/u/7ZK3QWERTY`,
      );
    });
  });

  /**
   * The bug that wastes the afternoon: the sheet is right, the names are
   * right, and every symbol points at the same box. Nothing on the page
   * would look wrong.
   */
  it("gives every label its OWN box, which a wall of identical squares hides", async () => {
    renderApp({ route: "/labels" });

    await userEvent.click(
      await screen.findByRole("button", { name: /everything inside garage/i }),
    );

    const labels = labelsOn(await theSheet());
    expect(labels).toHaveLength(3);

    await waitFor(async () => {
      const decoded = await Promise.all(labels.map(async (label) => await symbolOn(label)));

      expect(decoded).toEqual([
        `${PUBLIC_BASE_URL}/u/WARDROBE01`,
        `${PUBLIC_BASE_URL}/u/7ZK3QWERTY`,
        `${PUBLIC_BASE_URL}/u/QQ11223344`,
      ]);
    });
  });

  /**
   * A preview that does not match what comes out is worse than no preview:
   * printing half a sheet of blank squares costs the paper AND the trust.
   */
  it("refuses to offer printing until every symbol has arrived", async () => {
    let answer = (): void => undefined;
    const arrived = new Promise<void>((resolve) => {
      answer = resolve;
    });
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3/qr.svg`, async () => {
        await arrived;

        return HttpResponse.text(symbolFor(box3), {
          headers: { "content-type": "image/svg+xml" },
        });
      }),
    );

    renderApp({ route: "/labels" });
    await tick(/^box 3$/i);

    expect(await screen.findByRole("button", { name: /print/i })).toBeDisabled();

    answer();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /print/i })).toBeEnabled();
    });
  });

  it("says a symbol could not be fetched instead of printing a hole", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/box3/qr.svg`, () =>
        HttpResponse.json(
          { error: { code: "STORAGE_UNIT_NOT_FOUND", message: "no such unit" } },
          { status: 404 },
        ),
      ),
    );

    renderApp({ route: "/labels" });
    await tick(/^box 3$/i);

    expect(await screen.findByText(/could not be fetched/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /print/i })).toBeDisabled();
  });

  it("clears the whole selection, because sixty ticks is a lot to undo", async () => {
    renderApp({ route: "/labels" });
    await userEvent.click(
      await screen.findByRole("button", { name: /everything inside garage/i }),
    );
    await theSheet();

    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    expect(await screen.findByText(/tick the units you want labels for/i)).toBeVisible();
    expect(screen.queryByRole("region", { name: /label sheet/i })).toBeNull();
  });

  it("prints, because the whole point is sticking them on boxes", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);

    renderApp({ route: "/labels" });
    await tick(/^box 3$/i);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /print/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: /print/i }));

    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

/**
 * # Pages, and why they are counted here rather than left to the browser
 *
 * A grid tall enough to overflow gets broken by the printer wherever it
 * happens to run out of paper, and `break-inside: avoid` on a label only
 * stops it being cut in half — it will still push a whole row onto a page
 * that then has eleven labels on it, and the preview on the screen will not
 * agree with the paper.
 *
 * So the pages are made explicitly, twelve labels each, and the break is
 * between them. The preview then IS the pages.
 */
describe("the page a sheet is printed on", () => {
  beforeEach(() => {
    signedInWithTheForest([garage, wardrobe, box3, box4, shed]);
  });

  it("fits twelve labels to an A4 page", () => {
    expect(LABELS_PER_PAGE).toBe(12);
  });

  it("puts a handful of labels on one page", async () => {
    renderApp({ route: "/labels" });
    await userEvent.click(
      await screen.findByRole("button", { name: /everything inside garage/i }),
    );

    const pages = within(await theSheet()).getAllByRole("group");
    expect(pages).toHaveLength(1);
    expect(labelsOn(pages[0] as HTMLElement)).toHaveLength(3);
  });

  it("starts a second page rather than letting a label fall off the first", async () => {
    // Thirteen units, so the thirteenth has to go somewhere.
    const many = Array.from({ length: 13 }, (_, index) =>
      aStorageUnit({
        id: `b${String(index)}`,
        name: `Box ${String(index).padStart(2, "0")}`,
        publicId: `PUB000000${String(index).padStart(2, "0")}`,
      }),
    );
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: many.map((unit) => aTree(unit)) }),
      ),
      ...many.map((unit) =>
        http.get(`${API_URL}/storage-units/${unit.id}/qr.svg`, () =>
          HttpResponse.text(symbolFor(unit), {
            headers: { "content-type": "image/svg+xml" },
          }),
        ),
      ),
    );

    renderApp({ route: "/labels" });
    await userEvent.click(await screen.findByRole("button", { name: /^select all$/i }));

    const pages = within(await theSheet()).getAllByRole("group");
    expect(pages).toHaveLength(2);
    expect(labelsOn(pages[0] as HTMLElement)).toHaveLength(12);
    expect(labelsOn(pages[1] as HTMLElement)).toHaveLength(1);
  });

  it("says how many pages and labels are coming, before any paper is used", async () => {
    renderApp({ route: "/labels" });
    await userEvent.click(
      await screen.findByRole("button", { name: /everything inside garage/i }),
    );

    expect(await screen.findByText(/3 labels on 1 page/i)).toBeVisible();
  });
});
