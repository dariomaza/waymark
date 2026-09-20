import { unitId, type UnitId } from "@ariadna/domain";
import { useState, type JSX } from "react";

import { describeFailure, type StorageUnitView } from "@ariadna/api-client";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { flattenUnits } from "./flatten-tree.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { useEmptyUnit } from "./unit-mutations.js";
import { unitOptions } from "./views/unit-options.js";

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
  const tree = useStorageUnitTree();
  const empty = useEmptyUnit(unit.id);
  const [target, setTarget] = useState<string>("");

  const needsTarget = parent === null;
  const chosen: UnitId | undefined =
    needsTarget && target !== "" ? unitId(target) : undefined;

  return (
    <Sheet title={`Empty ${unit.name}`} onClose={onClose}>
      {needsTarget ? (
        <>
          <p>
            A root unit has no parent to empty into. Everything inside {unit.name} has
            to go somewhere else.
          </p>
          <SelectField
            id="empty-target"
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
        </>
      ) : (
        <p>
          Everything inside {unit.name} moves up into {parent.name}. Nothing is
          deleted.
        </p>
      )}

      {empty.isError ? (
        <Callout tone="wrong">{describeFailure(empty.error)}</Callout>
      ) : null}

      <div className="sheet__buttons">
        <Button onClick={onClose}>Cancel</Button>
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
          Empty it
        </Button>
      </div>
    </Sheet>
  );
};
