import { type StorageUnitView, editableUnits } from "@waymark/api-client";
import { cyclicMoveMessage, describeFailure } from "@waymark/i18n";
import { unitId } from "@waymark/domain";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useStorageUnitTree } from "./unit-queries.js";

import { useMoveUnit } from "./unit-mutations.js";
import { unitOptions } from "./views/unit-options.js";
import { useTranslate } from "../app/language-context.js";

export interface MoveUnitDialogProps {
  readonly unit: StorageUnitView;
  /**
   * Whether it may become a top-level space (ADR 26): its owner's call, so a
   * space somebody was shared with edit on cannot be lifted out of the tree
   * it was shared in.
   */
  readonly mayMoveToTop: boolean;
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
export const MoveUnitDialog = ({ unit, mayMoveToTop, onClose }: MoveUnitDialogProps): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const move = useMoveUnit(unit.id);
  const [target, setTarget] = useState<string>(unit.parentId ?? MAKE_IT_A_ROOT);

  const cyclic = t(cyclicMoveMessage(move.error, unit.name));

  return (
    <Sheet title={t("sheet.move", { name: unit.name })} onClose={onClose}>
      <SelectField
        id="move-target"
        label={t("units.moveInto")}
        value={target}
        options={[
          mayMoveToTop
            ? { value: MAKE_IT_A_ROOT, label: t("units.nowhereRoot") }
            : { value: MAKE_IT_A_ROOT, label: t("units.chooseUnit") },
          // Only where the person may put something; the cycle rule is still
          // the domain's to say, with a sentence (ADR 2).
          ...unitOptions(editableUnits(tree.data?.tree ?? [])),
        ]}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
      />

      {move.isError ? (
        <Callout tone={cyclic === null ? "wrong" : "blocked"}>
          {cyclic ?? t(describeFailure(move.error))}
        </Callout>
      ) : null}

      <div className="sheet__commit">
        <Button
          tone="primary"
          disabled={move.isPending || (target === MAKE_IT_A_ROOT && !mayMoveToTop)}
          onClick={() => {
            move.mutate(target === MAKE_IT_A_ROOT ? null : unitId(target), {
              onSuccess: onClose,
            });
          }}
        >
          {t("units.moveIt")}
        </Button>
      </div>
    </Sheet>
  );
};
