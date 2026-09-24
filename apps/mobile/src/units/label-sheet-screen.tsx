import { type FlatUnit, flattenUnits, subtreeOf } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import { LABELS_PER_PAGE } from "@waymark/tokens";
import type { UnitId } from "@waymark/domain";
import { useCallback, useMemo, useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslate } from "../app/language-context.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { Screen } from "../ui/organisms/screen.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import { useLabelSymbols } from "./label-symbols.js";
import { usePrinter } from "./printer-context.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { labelSheetPage } from "./views/label-sheet-page.js";
import { UnitChecklist } from "./views/unit-checklist.js";

/**
 * # Labelling a whole storage room in one afternoon, from the phone
 *
 * The browser has had this screen since the QR routes existed and this client
 * had nothing, because ADR 21 decided printing was a browser errand. The owner
 * put both clients on his one phone and asked why: "la app no tiene las hojas
 * de etiquetas". He is right, and so is `expo-print`, which has shipped Android
 * printing the whole time. The ADR is amended.
 *
 * ## What is shared with the browser, and what is not
 *
 * Everything except the surface. `flattenUnits` and `subtreeOf` are the shared
 * client's; the symbols come from the shared client's `qrSvg`; the paper's
 * geometry is `LABEL_SHEET` in `@waymark/tokens`, which is also what the
 * browser's stylesheet reads; every word is the same dictionary key.
 *
 * What differs is where the page is drawn. The browser lays it out in the
 * document it is already showing and calls `window.print()`, so it can put a
 * real preview on screen. A phone has no such surface: the page is built as a
 * document and handed to Android's print service, whose own dialog is the
 * preview. So this screen shows the CHOOSING and the COUNT, and the page itself
 * appears when the platform puts it up — which is the same trade every port in
 * this app makes. Intent is what the two clients owe each other; mechanism is
 * not.
 *
 * A container: it owns the tree, which units are ticked, whether the symbols
 * have arrived and what the printer said. Everything it draws is presentational.
 */
export const LabelSheetScreen = (): JSX.Element => {
  const t = useTranslate();

  const printer = usePrinter();
  const tree = useStorageUnitTree();
  const units = useMemo(() => flattenUnits(tree.data?.tree ?? []), [tree.data]);

  const [chosen, setChosen] = useState<readonly UnitId[]>([]);
  const picked = useMemo(() => new Set(chosen), [chosen]);
  const [refused, setRefused] = useState<Error | null>(null);

  const toggle = useCallback((id: UnitId) => {
    setChosen((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
  }, []);

  const pickInside = useCallback(
    (id: UnitId) => {
      setChosen((current) => [
        ...new Set([
          ...current,
          ...subtreeOf(tree.data?.tree ?? [], id).map((unit) => unit.id),
        ]),
      ]);
    },
    [tree.data],
  );

  /**
   * The order on the paper is the order of the TREE, never the order things
   * were ticked in: the labels come off the scissors in the order somebody
   * walks the room.
   */
  const sheet: readonly FlatUnit[] = units.filter((entry) => picked.has(entry.unit.id));
  const symbols = useLabelSymbols(sheet.map((entry) => entry.unit.id));
  const pages = Math.ceil(sheet.length / LABELS_PER_PAGE);

  const print = useCallback(() => {
    setRefused(null);
    printer
      .print(
        labelSheetPage({
          units: sheet,
          symbols: symbols.markup,
          describeSymbol: (name) => t("units.qrCodeFor", { name }),
        }),
      )
      .catch((error: unknown) => {
        setRefused(error instanceof Error ? error : new Error(String(error)));
      });
  }, [printer, sheet, symbols.markup, t]);

  return (
    <Screen>
      <ScreenTitle>{t("label.sheet")}</ScreenTitle>

      {tree.isPending ? <Loading label={t("inventory.loading")} /> : null}

      {tree.isError ? (
        <FailureNote
          error={tree.error}
          title={t("inventory.failed")}
          onRetry={() => {
            void tree.refetch();
          }}
        />
      ) : null}

      {tree.isSuccess ? (
        <>
          <Text style={styles.count}>
            {sheet.length === 0
              ? t("label.nothingPicked")
              : t("label.countOnPages", {
                  labels: t("label.labelCount", { count: sheet.length }),
                  pages: t("label.pageCount", { count: pages }),
                })}
          </Text>

          <Button tone="primary" icon="tags" disabled={!symbols.ready} block onPress={print}>
            {symbols.waitingFor === 0
              ? t("action.print")
              : t("label.printWaiting", { count: symbols.waitingFor })}
          </Button>

          <View style={styles.row}>
            <Button
              onPress={() => {
                setChosen(units.map((entry) => entry.unit.id));
              }}
            >
              {t("action.selectAll")}
            </Button>
            <Button
              disabled={sheet.length === 0}
              onPress={() => {
                setChosen([]);
              }}
            >
              {t("action.clear")}
            </Button>
          </View>

          {symbols.failure === null ? null : (
            <Callout tone="wrong">
              {`${t("label.symbolMissing")} ${t(describeFailure(symbols.failure))}`}
            </Callout>
          )}

          {refused === null ? null : (
            <Callout tone="wrong">
              {`${t("label.printFailed")} ${refused.message}`}
            </Callout>
          )}

          <Text style={styles.hint}>{t("label.printingHintPhone")}</Text>

          {sheet.length === 0 ? <EmptyNote>{t("label.pickUnits")}</EmptyNote> : null}

          <UnitChecklist
            units={units}
            isPicked={(id) => picked.has(id)}
            onToggle={toggle}
            onPickInside={pickInside}
          />
        </>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  count: { color: colors.ink, fontSize: text.m },
  hint: { color: colors.inkMuted, fontSize: text.s },
  row: { flexDirection: "row", gap: space.s2 },
});
