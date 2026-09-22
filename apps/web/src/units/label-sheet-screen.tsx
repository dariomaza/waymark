import { type FlatUnit, flattenUnits, subtreeOf } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import { unitId, type UnitId } from "@waymark/domain";
import { useCallback, useMemo, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { useLabelSymbols } from "./label-symbols.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { LabelSheet, LABELS_PER_PAGE } from "./views/label-sheet.js";
import { UnitChecklist } from "./views/unit-checklist.js";

import "./label-sheet-screen.css";
import { useTranslate } from "../app/language-context.js";

/**
 * # Labelling a whole storage room in one afternoon
 *
 * There has been a printable label per unit since the QR routes existed, and
 * printing them one at a time means the room never gets labelled: open the
 * box, open its label, print, go back, sixty times. A room of unlabelled
 * boxes is this app failing at the one thing it is named after.
 *
 * So the unit of work is the SHEET. Pick the units, get A4 pages of twelve,
 * print, cut, stick.
 *
 * ## Which units
 *
 * Both ways, because they answer different afternoons. A tick against any
 * unit for "these four boxes I just filled", and "everything inside" for
 * "the garage" — which is one press because a location IS a storage unit
 * (ADR 1) and the tree the app already loads makes the subtree free.
 *
 * `?within=<id>` arrives from a unit's own screen and means the same thing it
 * means on a search (ADR 11): everything strictly inside, because a box is not
 * inside itself. The room is one tick away if somebody wants a label for it.
 *
 * A container: it owns the URL, the tree, which units are ticked, and whether
 * the symbols have arrived. Everything it draws is presentational.
 */
export const LabelSheetScreen = (): JSX.Element => {
  const t = useTranslate();

  const [params] = useSearchParams();
  const within = params.get("within");
  const tree = useStorageUnitTree();

  const units = useMemo(() => flattenUnits(tree.data?.tree ?? []), [tree.data]);

  /**
   * What `?within=` asked for, until somebody touches a tick.
   *
   * Held as "no answer yet" rather than seeded by an effect: an effect would
   * fire when the tree arrives, which is also the moment the person may have
   * already started ticking, and the two would race over their own selection.
   */
  const suggested = useMemo(
    () =>
      within === null
        ? []
        : subtreeOf(tree.data?.tree ?? [], unitId(within)).map((unit) => unit.id),
    [tree.data, within],
  );
  const [chosen, setChosen] = useState<readonly UnitId[] | null>(null);
  const picked = useMemo(() => new Set(chosen ?? suggested), [chosen, suggested]);

  const toggle = useCallback(
    (id: UnitId) => {
      setChosen((current) => {
        const base = current ?? suggested;

        return base.includes(id)
          ? base.filter((other) => other !== id)
          : [...base, id];
      });
    },
    [suggested],
  );

  const pickInside = useCallback(
    (id: UnitId) => {
      setChosen((current) => [
        ...new Set([
          ...(current ?? suggested),
          ...subtreeOf(tree.data?.tree ?? [], id).map((unit) => unit.id),
        ]),
      ]);
    },
    [suggested, tree.data],
  );

  /**
   * The order on the paper is the order of the TREE, never the order things
   * were ticked in: the labels come off the scissors in the order somebody
   * walks the room.
   */
  const sheet: readonly FlatUnit[] = units.filter((entry) => picked.has(entry.unit.id));
  const symbols = useLabelSymbols(sheet.map((entry) => entry.unit.id));
  const pages = Math.ceil(sheet.length / LABELS_PER_PAGE);

  return (
    <main className="screen label-sheet-screen">
      <h2 className="label-sheet-screen__heading">{t("label.sheet")}</h2>

      {tree.isPending ? <Loading label={t("inventory.loading")} /> : null}

      {tree.isError ? (
        <FailureNote
          error={tree.error}
          onRetry={() => {
            void tree.refetch();
          }}
        />
      ) : null}

      {tree.isSuccess ? (
        <>
          <div className="label-sheet-screen__controls">
            <p className="label-sheet-screen__count">
              {sheet.length === 0
                ? `Nothing picked yet.`
                : `${plural(sheet.length, "label")} on ${plural(pages, "page")}.`}
            </p>
            <Button
              tone="primary"
              disabled={!symbols.ready}
              onClick={() => {
                globalThis.print();
              }}
            >
              {symbols.waitingFor === 0
                ? `Print`
                : t("label.printWaiting", { count: symbols.waitingFor })}
            </Button>
            <Button
              onClick={() => {
                setChosen(units.map((entry) => entry.unit.id));
              }}
            >
              {t("action.selectAll")}
            </Button>
            <Button
              disabled={sheet.length === 0}
              onClick={() => {
                setChosen([]);
              }}
            >
              {t("action.clear")}
            </Button>
          </div>

          {symbols.failure === null ? null : (
            <Callout tone="wrong">
              A symbol could not be fetched, so the sheet is incomplete and
              printing is off. {t(describeFailure(symbols.failure))}
            </Callout>
          )}

          <p className="label-sheet-screen__hint">
            Plain A4 and scissors — no special label paper. In the print dialog,
            turn headers and footers OFF and leave the margins at default: the
            page already carries its own. What you see below is the page at its
            real size.
          </p>

          <div className="label-sheet-screen__picker">
            <UnitChecklist
              units={units}
              isPicked={(id) => picked.has(id)}
              onToggle={toggle}
              onPickInside={pickInside}
            />
          </div>

          {sheet.length === 0 ? (
            <EmptyNote>
              Tick the units you want labels for, or take a whole room with
              &ldquo;everything inside&rdquo;.
            </EmptyNote>
          ) : (
            <LabelSheet units={sheet} />
          )}
        </>
      ) : null}
    </main>
  );
};

const plural = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
