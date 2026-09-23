import { type StorageUnitView, flattenUnits } from "@waymark/api-client";
import { describeFailure, notEmptyMessage } from "@waymark/i18n";
import { unitId, type UnitId } from "@waymark/domain";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useStorageUnitTree } from "./unit-queries.js";

import { useDeleteUnit, useEmptyAndDeleteUnit } from "./unit-mutations.js";
import { unitOptions } from "./views/unit-options.js";
import { useTranslate } from "../app/language-context.js";

export interface DeleteUnitDialogProps {
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
 * So this dialog does not check whether the unit is empty before asking.
 * That check belongs to the API, it is the one that cannot be raced, and
 * repeating it here would be a second copy of a rule that can drift. It
 * asks, and when the answer is "still holds 1 item" it does the one thing
 * the person wants next: offers to empty it and delete it, in that order,
 * which is exactly the two calls ADR 3 provides for.
 */
export const DeleteUnitDialog = ({
  unit,
  parent,
  onClose,
  onDeleted,
}: DeleteUnitDialogProps): JSX.Element => {
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
        <>
          <p>{t("units.deleteUndone", { name: unit.name })}</p>
          {remove.isError ? (
            <Callout tone="wrong">{t(describeFailure(remove.error))}</Callout>
          ) : null}
          <div className="sheet__buttons">
            <Button onClick={onClose}>{t("action.cancel")}</Button>
            <Button
              tone="danger"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(undefined, { onSuccess: onDeleted });
              }}
            >
              {t("units.delete")}
            </Button>
          </div>
        </>
      ) : (
        <Callout tone="blocked" title={t("units.notEmptyTitle")}>
          <p>{stillFull}</p>

          {needsTarget ? (
            <SelectField
              id="delete-empty-target"
              label={t("units.moveEverythingInto")}
              value={target}
              options={[
                { value: "", label: t("units.chooseUnit") },
                ...unitOptions(
                  flattenUnits(tree.data?.tree ?? []).filter(
                    (entry) => entry.unit.id !== unit.id,
                  ),
                ),
              ]}
              onChange={(event) => {
                setTarget(event.target.value);
              }}
            />
          ) : null}

          {emptyAndRemove.isError ? (
            <Callout tone="wrong">{t(describeFailure(emptyAndRemove.error))}</Callout>
          ) : null}

          <div className="sheet__buttons">
            <Button onClick={onClose}>{t("units.leaveItAlone")}</Button>
            <Button
              tone="danger"
              disabled={emptyAndRemove.isPending || (needsTarget && chosen === undefined)}
              onClick={() => {
                emptyAndRemove.mutate(chosen, { onSuccess: onDeleted });
              }}
            >
              {parent === null
                ? t("units.emptyThereAndDelete")
                : t("units.emptyIntoAndDelete", { name: parent.name })}
            </Button>
          </div>
        </Callout>
      )}
    </Sheet>
  );
};
