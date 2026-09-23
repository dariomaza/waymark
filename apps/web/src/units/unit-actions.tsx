import type { StorageUnitView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { CreateItemDialog } from "../items/create-item-dialog.js";
import { CreateUnitDialog } from "./create-unit-dialog.js";
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
 * secondary rather than a peer, which is the whole difference between a
 * hierarchy and a row — one lime rectangle, one outlined one, and a person's
 * eye lands on the right one without reading either.
 *
 * It owns which of its two sheets is open and nothing else. Each sheet owns
 * its own request and its own refusal.
 */
export const UnitActions = ({ unit }: UnitActionsProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<"item" | "unit" | null>(null);

  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      {/*
        The two shapes say what KIND of thing is about to be added, which is
        the only thing that separates these two sentences — a plus for a thing,
        a box for a box. Two identical pluses would leave the eye to the words
        again, which is the state this whole change is getting out of.
      */}
      <Button
        tone="primary"
        icon="plus"
        onClick={() => {
          setOpen("item");
        }}
      >
        {t("units.addItem")}
      </Button>
      <Button
        icon="box"
        onClick={() => {
          setOpen("unit");
        }}
      >
        {t("units.addInside")}
      </Button>

      {open === "item" ? (
        <CreateItemDialog storageUnitId={unit.id} unitName={unit.name} onClose={close} />
      ) : null}

      {open === "unit" ? <CreateUnitDialog parentId={unit.id} onClose={close} /> : null}
    </>
  );
};
