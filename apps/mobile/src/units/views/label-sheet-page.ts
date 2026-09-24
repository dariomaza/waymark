import type { FlatUnit } from "@waymark/api-client";
import { STORAGE_UNIT_PATH_SEPARATOR } from "@waymark/domain";
import type { UnitId } from "@waymark/domain";
import { LABELS_PER_PAGE, LABEL_SHEET } from "@waymark/tokens";

/**
 * # The same piece of paper, drawn for a different renderer
 *
 * The browser lays this page out with `label-sheet.css` and calls
 * `window.print()`. This client builds the same page as a document and hands it
 * to Android's print service, because that is the only surface a phone has to
 * print from (see `printer.ts`).
 *
 * Every measurement is `LABEL_SHEET` from `@waymark/tokens` — the page, the
 * grid, the symbol, the type sizes and the four printed colours — which is the
 * same object the browser's stylesheet reads as custom properties. That is the
 * point of this file being a renderer rather than a second design: a
 * millimetre spelled twice is a millimetre that drifts, which is ADR 22.
 *
 * The class names are the browser's too. Nothing depends on them, and they are
 * kept anyway: somebody comparing what comes out of the two clients should be
 * able to read the two pages as one page.
 *
 * ## What earns a place on one label
 *
 * The name, biggest and first, because a wall of identical QR squares means
 * scanning every one and a wall of names means reading it. The symbol, which is
 * the point. The code, ten characters of Crockford Base32, for the day a label
 * is scuffed past what level Q can recover. And where it lives, small and
 * quiet — not for the person holding the box, who can see where they are, but
 * for the ten minutes between the printer and the glue when twelve cut-out
 * squares have to be matched to twelve boxes, three of which are called `Box 3`.
 *
 * Not the kind. "Box" written on a label glued to a box costs a line on every
 * label and tells nobody anything they cannot see by looking at the thing.
 */

/**
 * The symbol, inline, as a data URI.
 *
 * `encodeURIComponent` rather than base64: Hermes has no `btoa`, and the
 * alternative is carrying an encoder for a string that is already text. The
 * symbol has to be IN the document because the QR routes are behind the session
 * (ADR 6) and a print renderer has no token to fetch one with.
 */
const symbolSource = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * Names come from whoever typed them. A box called `Tools & bits` must not be
 * able to close a tag, and a print renderer is a browser engine like any other.
 */
const escaped = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const chunk = <T,>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, page) =>
    items.slice(page * size, page * size + size),
  );

const mm = (value: number): string => `${String(value)}mm`;

/**
 * The stylesheet, generated from the shared geometry.
 *
 * `@page` carries the size and the margins so Android's renderer is told what
 * paper this is rather than guessing; the pages are chunked below and the break
 * goes between the chunks, so what comes out of the printer is what was counted
 * on the screen.
 */
const styles = (): string => `
  @page { size: A4; margin: ${mm(LABEL_SHEET.marginTopMm)} ${mm(LABEL_SHEET.marginSideMm)}; }
  html, body { margin: 0; padding: 0; background: ${LABEL_SHEET.paper}; color: ${LABEL_SHEET.ink}; }
  .label-sheet__page {
    width: ${mm(LABEL_SHEET.pageWidthMm)};
    height: ${mm(LABEL_SHEET.pageHeightMm)};
    display: grid;
    grid-template-columns: repeat(${String(LABEL_SHEET.columns)}, 1fr);
    grid-template-rows: repeat(${String(LABEL_SHEET.rows)}, 1fr);
    background: ${LABEL_SHEET.paper};
    break-after: page;
  }
  .label-sheet__page:last-child { break-after: auto; }
  .sheet-label {
    border: ${mm(LABEL_SHEET.cutGuideWidthMm)} dashed ${LABEL_SHEET.cutGuide};
    padding: ${mm(LABEL_SHEET.cellPaddingMm)};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${mm(LABEL_SHEET.cellGapMm)};
    overflow: hidden;
    break-inside: avoid;
  }
  .sheet-label__name {
    margin: 0;
    font-size: ${mm(LABEL_SHEET.nameMm)};
    line-height: 1.15;
    font-weight: 700;
    text-align: center;
    max-height: ${mm(LABEL_SHEET.nameMaxHeightMm)};
    overflow: hidden;
  }
  .sheet-label__symbol {
    width: ${mm(LABEL_SHEET.symbolMm)};
    height: ${mm(LABEL_SHEET.symbolMm)};
    flex: none;
    background: ${LABEL_SHEET.paper};
  }
  .sheet-label__code {
    margin: 0;
    font-family: monospace;
    font-size: ${mm(LABEL_SHEET.codeMm)};
    letter-spacing: 0.08em;
  }
  .sheet-label__where {
    margin: 0;
    font-size: ${mm(LABEL_SHEET.whereMm)};
    color: ${LABEL_SHEET.whereInk};
    text-align: center;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* A printer "saving ink" turns a black symbol into a grey square no camera
     can read, so the colours are stated as exact. */
  .label-sheet__page, .sheet-label { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
`;

const label = (entry: FlatUnit, svg: string, qrLabel: string): string => {
  const where = entry.ancestry.join(STORAGE_UNIT_PATH_SEPARATOR);

  return `<article class="sheet-label" data-label-for="${escaped(entry.unit.id)}">
    <p class="sheet-label__name">${escaped(entry.unit.name)}</p>
    <img class="sheet-label__symbol" src="${symbolSource(svg)}" alt="${escaped(qrLabel)}">
    <p class="sheet-label__code">${escaped(entry.unit.publicId)}</p>
    ${where === "" ? "" : `<p class="sheet-label__where">${escaped(where)}</p>`}
  </article>`;
};

export interface LabelSheetPageInput {
  /** In the order the tree is drawn, which is the order they will print in. */
  readonly units: readonly FlatUnit[];
  readonly symbols: ReadonlyMap<UnitId, string>;
  /** "QR code for {name}", from the dictionary, for whoever reads the PDF. */
  readonly describeSymbol: (name: string) => string;
}

/**
 * The whole document, ready for the platform.
 *
 * A unit whose symbol has not arrived is simply not on the page. The screen
 * will not offer printing until every one of them has (`useLabelSymbols`), so
 * this is a belt rather than a decision — but a label with a hole where its
 * symbol should be is the one outcome worth making impossible here too.
 */
export const labelSheetPage = ({
  units,
  symbols,
  describeSymbol,
}: LabelSheetPageInput): string => {
  const drawable = units.filter((entry) => symbols.has(entry.unit.id));

  const pages = chunk(drawable, LABELS_PER_PAGE)
    .map(
      (page) =>
        `<div class="label-sheet__page">${page
          .map((entry) =>
            label(entry, symbols.get(entry.unit.id) ?? "", describeSymbol(entry.unit.name)),
          )
          .join("")}</div>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styles()}</style></head><body><section class="label-sheet">${pages}</section></body></html>`;
};
