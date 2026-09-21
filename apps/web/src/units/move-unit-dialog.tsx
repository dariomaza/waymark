import { cyclicMoveMessage, describeFailure, flattenUnits, type StorageUnitView } from "@ariadna/api-client";
import { unitId } from "@ariadna/domain";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useStorageUnitTree } from "./unit-queries.js";

import { useMoveUnit } from "./unit-mutations.js";
import { unitOptions } from "./views/unit-options.js";

export interface MoveUnitDialogProps {
  readonly unit: StorageUnitView;
  readonly onClose: () => void;
}

const MAKE_IT_A_ROOT = "";

/**
 * Where should this go?
 *
 * Every unit in the house is offered, including the ones that would make a
 * cycle. That is deliberate: ADR 2 puts the subtree rule in the domain
 * because a foreign key cannot express it, and a picker that quietly hid the
 * illegal options would be this app's own second copy of it. The API refuses,
 * and the refusal is the sentence the person reads.
 */
export const MoveUnitDialog = ({ unit, onClose }: MoveUnitDialogProps): JSX.Element => {
  const tree = useStorageUnitTree();
  const move = useMoveUnit(unit.id);
  const [target, setTarget] = useState<string>(unit.parentId ?? MAKE_IT_A_ROOT);

  const cyclic = cyclicMoveMessage(move.error, unit.name);

  return (
    <Sheet title={`Move ${unit.name}`} onClose={onClose}>
      <SelectField
        id="move-target"
        label="Move it into"
        value={target}
        options={[
          { value: MAKE_IT_A_ROOT, label: "Nowhere — make it a root" },
          ...unitOptions(flattenUnits(tree.data?.tree ?? [])),
        ]}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
      />

      {move.isError ? (
        <Callout tone={cyclic === null ? "wrong" : "blocked"}>
          {cyclic ?? describeFailure(move.error)}
        </Callout>
      ) : null}

      <div className="sheet__buttons">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={move.isPending}
          onClick={() => {
            move.mutate(target === MAKE_IT_A_ROOT ? null : unitId(target), {
              onSuccess: onClose,
            });
          }}
        >
          Move it
        </Button>
      </div>
    </Sheet>
  );
};
