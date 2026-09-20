import { unitId, type UnitId } from "@ariadna/domain";
import { useState, type JSX } from "react";

import type { StorageUnitView } from "../api/contract.js";
import { describeFailure } from "../api/describe-failure.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { flattenUnits } from "./flatten-tree.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { notEmptyMessage } from "./unit-messages.js";
import { useDeleteUnit, useEmptyAndDeleteUnit } from "./unit-mutations.js";
import { unitOptions } from "./views/unit-options.js";

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
  const tree = useStorageUnitTree();
  const remove = useDeleteUnit(unit.id);
  const emptyAndRemove = useEmptyAndDeleteUnit(unit.id);
  const [target, setTarget] = useState<string>("");

  const stillFull = notEmptyMessage(remove.error, unit.name);
  const needsTarget = parent === null;
  const chosen: UnitId | undefined =
    needsTarget && target !== "" ? unitId(target) : undefined;

  return (
    <Sheet title={`Delete ${unit.name}`} onClose={onClose}>
      {stillFull === null ? (
        <>
          <p>Deleting {unit.name} cannot be undone.</p>
          {remove.isError ? (
            <Callout tone="wrong">{describeFailure(remove.error)}</Callout>
          ) : null}
          <div className="sheet__buttons">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              tone="danger"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(undefined, { onSuccess: onDeleted });
              }}
            >
              Delete this unit
            </Button>
          </div>
        </>
      ) : (
        <Callout tone="blocked" title="This one is not empty">
          <p>{stillFull}</p>

          {needsTarget ? (
            <SelectField
              id="delete-empty-target"
              label="Move everything into"
              value={target}
              options={[
                { value: "", label: "Choose a unit…" },
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
            <Callout tone="wrong">{describeFailure(emptyAndRemove.error)}</Callout>
          ) : null}

          <div className="sheet__buttons">
            <Button onClick={onClose}>Leave it alone</Button>
            <Button
              tone="danger"
              disabled={emptyAndRemove.isPending || (needsTarget && chosen === undefined)}
              onClick={() => {
                emptyAndRemove.mutate(chosen, { onSuccess: onDeleted });
              }}
            >
              {parent === null
                ? "Empty it there and delete"
                : `Empty it into ${parent.name} and delete`}
            </Button>
          </div>
        </Callout>
      )}
    </Sheet>
  );
};
