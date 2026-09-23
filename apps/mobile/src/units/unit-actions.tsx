import type { StorageUnitView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { CreateItemSheet } from "../items/create-item-sheet.js";
import { Button } from "../ui/atoms/button.js";
import { CreateUnitSheet } from "./create-unit-sheet.js";
import { useTranslate } from "../app/language-context.js";

export interface UnitActionsProps {
  readonly unit: StorageUnitView;
}

/**
 * What a box is FOR: putting something in it.
 *
 * Two controls, and they are the only two on this screen that are not behind
 * the menu — because they are the two reasons somebody opens a box's screen
 * with an intention rather than a question. Everything else that can be done
 * to this unit is in `UnitMenu`, beside its name (ADR 21).
 *
 * The primary is "Add an item" and not "Add a space inside": a shelf holds
 * things a hundred times for every time it grows a drawer. The second is a
 * secondary rather than a peer, which is the difference between a hierarchy
 * and a column — one lime rectangle and one outlined one, so a thumb lands on
 * the right one without reading either.
 *
 * The two shapes say what KIND of thing is about to be added, which is the
 * only thing separating the two sentences: a plus for a thing, a box for a
 * box. Two identical pluses would leave the eye to the words again.
 */
export const UnitActions = ({ unit }: UnitActionsProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<"item" | "unit" | null>(null);

  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      <Button
        tone="primary"
        icon="plus"
        onPress={() => {
          setOpen("item");
        }}
      >
        {t("units.addItem")}
      </Button>
      <Button
        icon="box"
        onPress={() => {
          setOpen("unit");
        }}
      >
        {t("units.addInside")}
      </Button>

      {open === "item" ? (
        <CreateItemSheet storageUnitId={unit.id} unitName={unit.name} onClose={close} />
      ) : null}

      {open === "unit" ? (
        <CreateUnitSheet parentId={unit.id} parentName={unit.name} onClose={close} />
      ) : null}
    </>
  );
};
