import { type StorageUnitView, flattenUnits } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import { unitId, type UnitId } from "@waymark/domain";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { useEmptyUnit } from "./unit-mutations.js";
import { unitOptions } from "./views/unit-options.js";
import { useTranslate } from "../app/language-context.js";

export interface EmptyUnitDialogProps {
  readonly unit: StorageUnitView;
  /** The unit one level up, when there is one. */
  readonly parent: StorageUnitView | null;
  readonly onClose: () => void;
  readonly onEmptied?: (() => void) | undefined;
}

/**
 * Emptying moves everything one level up — or into a unit chosen here, which
 * a root has no alternative to: it has no parent, and the API answers
 * `MISSING_EMPTY_TARGET` rather than guessing. Asking first is friendlier
 * than showing that refusal, and it is the same rule either way.
 */
export const EmptyUnitDialog = ({
  unit,
  parent,
  onClose,
  onEmptied,
}: EmptyUnitDialogProps): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const empty = useEmptyUnit(unit.id);
  const [target, setTarget] = useState<string>("");

  const needsTarget = parent === null;
  const chosen: UnitId | undefined =
    needsTarget && target !== "" ? unitId(target) : undefined;

  return (
    <Sheet title={t("sheet.empty", { name: unit.name })} onClose={onClose}>
      {needsTarget ? (
        <>
          <p>{t("units.rootNeedsTarget", { name: unit.name })}</p>
          <SelectField
            id="empty-target"
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
        </>
      ) : (
        <p>{t("units.emptyMovesUp", { name: unit.name, parent: parent.name })}</p>
      )}

      {empty.isError ? (
        <Callout tone="wrong">{t(describeFailure(empty.error))}</Callout>
      ) : null}

      <div className="sheet__buttons">
        <Button onClick={onClose}>{t("action.cancel")}</Button>
        <Button
          tone="primary"
          disabled={empty.isPending || (needsTarget && chosen === undefined)}
          onClick={() => {
            empty.mutate(chosen, {
              onSuccess: () => {
                onEmptied?.();
                onClose();
              },
            });
          }}
        >
          {t("units.emptyIt")}
        </Button>
      </div>
    </Sheet>
  );
};
