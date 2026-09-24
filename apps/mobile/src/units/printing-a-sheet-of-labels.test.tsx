import { aSession, aStorageUnit, aTree } from "@waymark/api-client/testing";
import type { StorageUnitView } from "@waymark/api-client";

import { API_URL, apiServer, http, HttpResponse } from "../testing/api-server.js";
import { fakePrinter, type FakePrinter } from "../testing/fake-printer.js";
import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";

/**
 * # Labelling a storage room in one afternoon, from the phone
 *
 * ADR 21 said printing was a browser errand and that this client "needs none of
 * this". That was wrong twice over: the owner has both clients on one phone and
 * asked why one of them has no label sheet, and `expo-print` has been shipping
 * Android printing and PDF generation the whole time. The ADR is amended; this
 * is the feature.
 *
 * It is tested as the same workflow the browser's is: pick the units, get the
 * page, print. What differs is only the surface the page is drawn on — the
 * browser lays it out with a stylesheet and calls `window.print()`, the phone
 * builds the same page as HTML and hands it to Android's print service — so the
 * assertions are about what reaches the PRINTER rather than about what is on
 * the screen.
 */
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
const shed = aStorageUnit({ id: "shed", name: "Shed", kind: "ROOM", publicId: "SHED000001" });

/** What the API renders for a unit. Real enough to be findable in the page. */
const symbolFor = (unit: StorageUnitView): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41"><title>${unit.publicId}</title></svg>`;

const theApiKnowsTheHouseAndItsSymbols = (): void => {
  apiServer.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ user: { id: "u1", username: "dario" } }),
    ),
    http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
    http.get(`${API_URL}/storage-units`, () =>
      HttpResponse.json({
        tree: [aTree(garage, [aTree(wardrobe, [aTree(box3)])]), aTree(shed)],
      }),
    ),
    ...[garage, wardrobe, box3, shed].map((unit) =>
      http.get(`${API_URL}/storage-units/${unit.id}/qr.svg`, () =>
        HttpResponse.text(symbolFor(unit), { headers: { "content-type": "image/svg+xml" } }),
      ),
    ),
  );
};

interface PrintedLabel {
  readonly id: string;
  /** The ten characters printed under the symbol. */
  readonly code: string;
  /** What the symbol ITSELF says, decoded out of the data URI it was embedded as. */
  readonly symbolSays: string;
}

/**
 * The labels on a printed page, in order, each carrying what its own symbol
 * encodes. The fixture symbols put the unit's public id in a `<title>`, which
 * stands in for the URL a real QR would encode.
 */
const labelsOn = (page: string): readonly PrintedLabel[] =>
  [
    ...page.matchAll(
      /<article class="sheet-label" data-label-for="(?<id>[^"]+)">(?<body>.*?)<\/article>/gsu,
    ),
  ].map((label) => {
    const body = label.groups?.["body"] ?? "";
    const source = /<img[^>]+src="data:image\/svg\+xml,(?<data>[^"]*)"/u.exec(body);
    const symbol = decodeURIComponent(source?.groups?.["data"] ?? "");

    return {
      id: label.groups?.["id"] ?? "",
      code: /class="sheet-label__code">(?<code>[^<]*)</u.exec(body)?.groups?.["code"] ?? "",
      symbolSays: /<title>(?<says>[^<]*)<\/title>/u.exec(symbol)?.groups?.["says"] ?? "",
    };
  });

const openTheSheet = async (printer: FakePrinter = fakePrinter()): Promise<FakePrinter> => {
  await renderApp({ session: aSession(), screen: { name: "Labels" }, printer });
  await screen.findByRole("checkbox", { name: "Garage" });

  return printer;
};

describe("a sheet of labels, from the phone", () => {
  beforeEach(theApiKnowsTheHouseAndItsSymbols);

  it("starts with nothing picked, and says so rather than offering blank paper", async () => {
    await openTheSheet();

    expect(screen.getByText(/tick the spaces you want labels for/i)).toBeOnTheScreen();
  });

  it("counts what is coming before any paper is used", async () => {
    await openTheSheet();

    await fireEvent.press(screen.getByRole("checkbox", { name: "Box 3" }));

    expect(await screen.findByText(/1 label on 1 page/i)).toBeOnTheScreen();
  });

  /**
   * The whole point of ADR 1: a location IS a storage unit, so "every box in
   * the garage" is one press rather than sixty. Without it the sheet is a
   * faster version of the same chore.
   */
  it("takes a whole subtree in one press", async () => {
    await openTheSheet();

    await fireEvent.press(screen.getByRole("button", { name: "Everything inside Garage" }));

    expect(await screen.findByText(/2 labels on 1 page/i)).toBeOnTheScreen();
  });

  it("unticks as easily as it ticks, because sixty boxes means mistakes", async () => {
    await openTheSheet();

    await fireEvent.press(screen.getByRole("checkbox", { name: "Box 3" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Shed" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Box 3" }));

    expect(await screen.findByText(/1 label on 1 page/i)).toBeOnTheScreen();
  });

  it("clears the whole selection, because sixty ticks is a lot to undo", async () => {
    await openTheSheet();

    await fireEvent.press(screen.getByRole("button", { name: "Everything inside Garage" }));
    await screen.findByText(/2 labels on 1 page/i);

    await fireEvent.press(screen.getByRole("button", { name: "Clear" }));

    expect(await screen.findByText(/tick the spaces you want labels for/i)).toBeOnTheScreen();
  });
});

describe("what the phone hands to the printer", () => {
  beforeEach(theApiKnowsTheHouseAndItsSymbols);

  const printPicking = async (name: string): Promise<FakePrinter> => {
    const printer = await openTheSheet();

    await fireEvent.press(screen.getByRole("checkbox", { name }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Print" })).not.toBeDisabled();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Print" }));

    return printer;
  };

  it("prints, because the whole point is sticking them on boxes", async () => {
    const printer = await printPicking("Box 3");

    expect(printer.printed).toHaveLength(1);
  });

  /**
   * The reason a label is not just a QR. Standing in front of twenty boxes, a
   * wall of identical squares means scanning every one of them; a name means
   * reading the wall. The code under it is what survives a scuff.
   */
  it("puts the name and the code on the page, not only the symbol", async () => {
    const printer = await printPicking("Box 3");

    expect(printer.printed[0]).toContain("Box 3");
    expect(printer.printed[0]).toContain("7ZK3QWERTY");
  });

  /**
   * Not for the person holding the box — they can see where they are. For the
   * ten minutes between the printer and the glue, when cut-out squares have to
   * be matched to boxes, three of which are called `Box 3`.
   */
  it("says where each unit lives, which is what tells two Box 3s apart", async () => {
    const printer = await printPicking("Box 3");

    expect(printer.printed[0]).toContain("Garage &gt; Metal wardrobe");
  });

  /**
   * # The bug that wastes the afternoon
   *
   * The sheet is right, the names are right, and every symbol points at the
   * same box. Nothing on the page would look wrong, and it is found after the
   * squares have been cut up and stuck on.
   *
   * So the symbols are DECODED out of the page and paired with the code printed
   * beside them, rather than counted. A test that only counted would pass for
   * twelve copies of one symbol, which is precisely the failure.
   */
  it("gives every label its OWN symbol, which a wall of identical squares hides", async () => {
    const printer = await openTheSheet();

    await fireEvent.press(screen.getByRole("button", { name: "Everything inside Garage" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Print" })).not.toBeDisabled();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Print" }));

    expect(labelsOn(printer.printed[0] ?? "")).toEqual([
      { id: "wardrobe", code: "WARDROBE01", symbolSays: "WARDROBE01" },
      { id: "box3", code: "7ZK3QWERTY", symbolSays: "7ZK3QWERTY" },
    ]);
  });

  /** A4, because this is Spain, and the same page the browser prints. */
  it("asks for the page the browser asks for", async () => {
    const printer = await printPicking("Box 3");

    expect(printer.printed[0]).toContain("size: A4");
    expect(printer.printed[0]).toContain("190mm");
  });

  /**
   * A page that does not match what comes out is worse than no page: printing
   * half a sheet of blank squares costs the paper AND the trust.
   */
  it("refuses to print until every symbol has arrived", async () => {
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

    await openTheSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Box 3" }));

    expect(await screen.findByRole("button", { name: /print/i })).toBeDisabled();

    answer();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Print" })).not.toBeDisabled();
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

    await openTheSheet();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Box 3" }));

    expect(await screen.findByText(/could not be fetched/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /print/i })).toBeDisabled();
  });

  /**
   * A phone with no print service, or one the person backed out of, is a
   * refusal like any other: it gets a sentence rather than a silence.
   */
  it("says so when the phone cannot print at all", async () => {
    const printer = fakePrinter({ refuses: new Error("no print service") });
    await openTheSheet(printer);

    await fireEvent.press(screen.getByRole("checkbox", { name: "Box 3" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Print" })).not.toBeDisabled();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Print" }));

    expect(await screen.findByText(/could not be printed/i)).toBeOnTheScreen();
  });
});

describe("getting to the sheet", () => {
  beforeEach(theApiKnowsTheHouseAndItsSymbols);

  it("is the second of the home screen's two buttons", async () => {
    await renderApp({ session: aSession(), screen: { name: "Tabs", params: { screen: "Inventory" } } });

    await fireEvent.press(await screen.findByRole("button", { name: "Label sheet" }));

    expect(await screen.findByText(/tick the spaces you want labels for/i)).toBeOnTheScreen();
  });
});

/**
 * # The two home screens, side by side on one phone
 *
 * The owner photographed both clients minutes apart. Beyond the row of buttons,
 * one thing on this screen still differed and it is the one that only shows
 * when something is slow or broken: this client drew the row ONLY once the tree
 * had arrived, so on a bad connection the home screen offered nothing at all
 * while the browser offered both ways in.
 *
 * The row is what the screen is FOR. It does not wait for a request.
 */
describe("the home screen while the inventory is not there", () => {
  it("still offers both ways in when the inventory could not be loaded", async () => {
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/auth/machine-tokens`, () => HttpResponse.json({ machineTokens: [] })),
      http.get(`${API_URL}/storage-units`, () => HttpResponse.error()),
    );

    await renderApp({
      session: aSession(),
      screen: { name: "Tabs", params: { screen: "Inventory" } },
    });

    expect(await screen.findByText(/could not be loaded/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Add a space" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Label sheet" })).toBeOnTheScreen();
  });
});
