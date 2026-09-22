import { STORAGE_UNIT_PATH_SEPARATOR } from "@ariadna/domain";
import type { FlatUnit } from "@ariadna/api-client";
import type { JSX } from "react";

import { AuthenticatedImage } from "../../photos/authenticated-image.js";
import { qrSvgPath } from "../label-symbols.js";

import "./label-sheet.css";
import { useTranslate } from "../../app/language-context.js";

/**
 * # Twelve labels to an A4 page
 *
 * A4 because this is Spain, and plain paper with scissors because a
 * proprietary label sheet is a thing you have to have bought before you can
 * label a box. 10mm side margins and 12mm top and bottom leave 190 × 273mm,
 * which is 3 columns by 4 rows of 63.3 × 68.2mm.
 *
 * The count is a scanning decision, not a packing one. A QR gets BIGGER as its
 * error correction goes up (ADR 9: level Q, 25%, which is what a scuffed
 * sticker in a garage needs), so at a fixed label size every extra codeword
 * makes every module smaller until a phone camera stops resolving them. The
 * payload here is `<base>/u/<publicId>` — around 35 characters, which at
 * level Q is a 33-module symbol plus its 4-module quiet zone on each side, 41
 * across. Printed at 36mm that is 0.88mm per module; a hostname long enough
 * to push it to 49 modules still gives 0.73mm. Both are comfortably past the
 * ~0.4mm where phone cameras start failing, and a 36mm symbol still leaves
 * room for a name somebody can read without a phone at all.
 *
 * Eighteen to a page was the other candidate — it matches a common
 * off-the-shelf A4 label sheet — and it was rejected because the cell is then
 * 46mm tall: either the symbol drops to ~28mm or the name does, and both of
 * those are the label's whole job.
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
export const LABELS_PER_PAGE = 12;

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
