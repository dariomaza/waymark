import { STORAGE_UNIT_PATH_SEPARATOR } from "@waymark/domain";
import { LABELS_PER_PAGE } from "@waymark/tokens";
import type { FlatUnit } from "@waymark/api-client";
import type { JSX } from "react";

import { AuthenticatedImage } from "../../photos/authenticated-image.js";
import { qrSvgPath } from "../label-symbols.js";

import "./label-sheet.css";
import { useTranslate } from "../../app/language-context.js";

/**
 * # Twelve labels to an A4 page
 *
 * Every measurement this draws with — the page, the grid, the symbol, the type
 * sizes and the four printed colours — is `LABEL_SHEET` in `@waymark/tokens`,
 * read here for the chunking and read by `label-sheet.css` as custom
 * properties. The phone builds the same page from the same object, which is why
 * the numbers left this file (ADR 21, amended; ADR 22 for the mechanism).
 *
 * That file carries the arithmetic: why A4, why twelve rather than eighteen,
 * and why a 36mm symbol is the smallest one a phone camera can be relied on to
 * read off a scuffed sticker in a garage.
 *
 * ## Why the pages are counted here instead of being left to the printer
 *
 * `break-inside: avoid` on a label stops one being cut in half. It does not
 * stop a row being pushed onto the next page, so a grid tall enough to
 * overflow gets broken wherever the paper runs out — and the preview on the
 * screen then disagrees with what comes out, which is worse than no preview.
 *
 * So the labels are chunked into pages of twelve here and the page break goes
 * between the chunks. The preview IS the pages.
 */
export { LABELS_PER_PAGE } from "@waymark/tokens";

export interface LabelSheetProps {
  /** In the order the tree is drawn, which is the order they will print in. */
  readonly units: readonly FlatUnit[];
}

export const LabelSheet = ({ units }: LabelSheetProps): JSX.Element => {
  const t = useTranslate();

  const pages = chunk(units, LABELS_PER_PAGE);

  return (
    <section className="label-sheet" aria-label={t("label.sheet")}>
      {pages.map((page, index) => (
        <div
          className="label-sheet__page"
          role="group"
          aria-label={t("label.pageOf", { page: index + 1, total: pages.length })}
          key={page[0]?.unit.id ?? index}
        >
          {page.map((entry) => (
            <SheetLabel entry={entry} key={entry.unit.id} />
          ))}
        </div>
      ))}
    </section>
  );
};

/**
 * # What earns a place on one label
 *
 * **The name, biggest and first.** Standing in front of twenty boxes, a wall
 * of identical QR squares means scanning every one of them to find the one
 * with the drill in it. A name means reading the wall. It goes at the top so
 * that a column of stuck-on labels reads as a column of names.
 *
 * **The symbol**, which is the point: a URL, so the stock camera offers to
 * OPEN the box rather than to copy a string.
 *
 * **The code**, ten characters of Crockford Base32. That is what `publicId`
 * is FOR — printed so it can be read out loud across a garage — and it is the
 * fallback for the day a label is scuffed past what level Q can recover.
 *
 * **Where it lives**, small and quiet, and NOT for the person holding the
 * box: they can see where they are. It is for the ten minutes between the
 * printer and the glue, when twelve identical cut-out squares have to be
 * matched to twelve boxes, three of which are called `Box 3`. It is the
 * ancestry and not the full path, because repeating the name directly under
 * the name is a wasted line.
 *
 * It is also the one thing here that can go stale: move the box and the
 * printed location is wrong. That is a real cost and it is worth paying,
 * because mis-matching a cut sheet happens every single time somebody prints
 * one, while moving a labelled box happens rarely — and when it does, the
 * symbol and the code are both still correct, so nothing that a scan or a
 * read-aloud depends on has broken.
 *
 * **Not the kind.** "Box" written on a label glued to a box costs a line on
 * every label and tells nobody anything they cannot see by looking at the
 * thing it is stuck to.
 */
const SheetLabel = ({ entry }: { readonly entry: FlatUnit }): JSX.Element => {
  const t = useTranslate();

  const where = entry.ancestry.join(STORAGE_UNIT_PATH_SEPARATOR);

  return (
    <article className="sheet-label" data-label-for={entry.unit.id}>
      <p className="sheet-label__name">{entry.unit.name}</p>
      <AuthenticatedImage
        className="sheet-label__symbol"
        src={qrSvgPath(entry.unit.id)}
        alt={t("units.qrCodeFor", { name: entry.unit.name })}
      />
      <p className="sheet-label__code">{entry.unit.publicId}</p>
      {where === "" ? null : <p className="sheet-label__where">{where}</p>}
    </article>
  );
};

const chunk = <T,>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, page) =>
    items.slice(page * size, page * size + size),
  );
