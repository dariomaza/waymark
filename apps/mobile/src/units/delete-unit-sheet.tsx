import { type StorageUnitView, flattenUnits } from "@waymark/api-client";
import { describeFailure, notEmptyMessage } from "@waymark/i18n";
import { unitId, type UnitId } from "@waymark/domain";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { OptionList } from "../ui/atoms/option-list.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import { useDeleteUnit, useEmptyAndDeleteUnit } from "./unit-mutations.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { unitOptions } from "./views/unit-options.js";
import { useTranslate } from "../app/language-context.js";

export interface DeleteUnitSheetProps {
  readonly unit: StorageUnitView;
  readonly parent: StorageUnitView | null;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

/**
 * # Deleting a unit, and the refusal that is a feature
 *
 * The domain will not throw away a full box (ADR 3): you empty it first,
 * then you discard it. The API says so with a 409 — a refusal about the
 * WORLD, which the same request would pass once the world changed (ADR 8).
 *
 * So this sheet does not check whether the unit is empty before asking.
 * That check belongs to the API, it is the one that cannot be raced, and
 * repeating it here would be a second copy of a rule that can drift. It
 * asks, and when the answer is "still holds 1 item" it does the one thing
 * the person wants next: offers to empty it and delete it, in that order,
 * which is exactly the two calls ADR 3 provides for.
 */
export const DeleteUnitSheet = ({
  unit,
  parent,
  onClose,
  onDeleted,
}: DeleteUnitSheetProps): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const remove = useDeleteUnit(unit.id);
  const emptyAndRemove = useEmptyAndDeleteUnit(unit.id);
  const [target, setTarget] = useState<string>("");

  const stillFull = t(notEmptyMessage(remove.error, unit.name));
  const needsTarget = parent === null;
  const chosen: UnitId | undefined =
    needsTarget && target !== "" ? unitId(target) : undefined;

  return (
    <Sheet title={t("sheet.delete", { name: unit.name })} onClose={onClose}>
      {stillFull === null ? (
        <View style={styles.block}>
          <Text style={styles.text}>{t("units.deleteUndone", { name: unit.name })}</Text>
          {remove.isError ? (
            <Callout tone="wrong">{t(describeFailure(remove.error))}</Callout>
          ) : null}
          <Button
            tone="danger"
            block
            disabled={remove.isPending}
            label={t("units.delete")}
            onPress={() => {
              remove.mutate(undefined, { onSuccess: onDeleted });
            }}
          >
            {t("units.delete")}
          </Button>
        </View>
      ) : (
        <Callout tone="blocked" title={t("units.notEmptyTitle")}>
          <View style={styles.block}>
            <Text style={styles.text}>{stillFull}</Text>

            {needsTarget ? (
              <OptionList
                label={t("units.moveEverythingInto")}
                value={target}
                options={unitOptions(
                  flattenUnits(tree.data?.tree ?? []).filter(
                    (entry) => entry.unit.id !== unit.id,
                  ),
                )}
                onChange={setTarget}
              />
            ) : null}

            {emptyAndRemove.isError ? (
              <Callout tone="wrong">{t(describeFailure(emptyAndRemove.error))}</Callout>
            ) : null}

            <Button
              tone="danger"
              block
              disabled={emptyAndRemove.isPending || (needsTarget && chosen === undefined)}
              label={
                parent === null
                  ? t("units.emptyThereAndDelete")
                  : t("units.emptyIntoAndDelete", { name: parent.name })
              }
              onPress={() => {
                emptyAndRemove.mutate(chosen, { onSuccess: onDeleted });
              }}
            >
              {parent === null
                ? t("units.emptyThereAndDelete")
                : t("units.emptyIntoAndDelete", { name: parent.name })}
            </Button>
          </View>
        </Callout>
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  block: { gap: space.s3 },
  text: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
});
