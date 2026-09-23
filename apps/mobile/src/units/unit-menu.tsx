import type { StorageUnitView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { OverflowMenu, type OverflowAction } from "../ui/molecules/overflow-menu.js";
import { CreateUnitSheet } from "./create-unit-sheet.js";
import { DeleteUnitSheet } from "./delete-unit-sheet.js";
import { EditUnitSheet } from "./edit-unit-sheet.js";
import { EmptyUnitSheet } from "./empty-unit-sheet.js";
import { MoveUnitSheet } from "./move-unit-sheet.js";
import { useTranslate } from "../app/language-context.js";

export interface UnitMenuProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit; the step before last is its parent. */
  readonly path: readonly StorageUnitView[];
  readonly onShowLabel: () => void;
  readonly onDeleted: () => void;
  /**
   * Offered only when there is something to pick and picking is not already
   * on. Absent means the line is not drawn at all, rather than drawn dead: a
   * menu of things that cannot be done is a menu somebody stops reading.
   */
  readonly onPickSeveral?: (() => void) | undefined;
}

type OpenSheet = "add" | "edit" | "move" | "empty" | "delete" | null;

/**
 * # Everything that can be done TO a storage unit
 *
 * It sits beside the unit's name rather than in the column of things to do,
 * because that is what these acts are ABOUT. Renaming a box, moving it,
 * emptying it and throwing it away are not things you do on this screen; they
 * are things you do to the box the screen is showing you, and the end of a
 * heading is where this platform has put a subject's own menu for as long as
 * it has had menus. ADR 21 is the rule.
 *
 * In the order somebody reaches for them:
 *
 * 1. **Select several** — the way into a bulk move that does not need a
 *    gesture. Long-pressing a card is what Android has meant by "start
 *    picking" for as long as it has had lists, and it is still invisible, so
 *    the menu says it in words and the bar that appears teaches the gesture.
 * 2. **Add a space inside** — the one line here that makes something, and the
 *    one that used to stand in the column outside. It was demoted because a
 *    shelf holds things a hundred times for every time it grows a drawer, and
 *    the owner wanted the visible pair to be adding a thing and searching; it
 *    sits this high IN here because of that same count.
 * 3. **Show the label** — looking at something, changing nothing.
 * 4. **Edit** and **Move** — two acts, not one "manage": editing changes what
 *    the unit SAYS about itself and cannot carry a parent, while moving
 *    changes where it IS and is guarded by the subtree invariant (ADR 2, ADR
 *    14). One control for both would hide the second behind the first.
 * 5. **Empty** and **Delete** — the two that take something away, last, behind
 *    a rule, as far from the screen's primary action as this menu goes.
 */
export const UnitMenu = ({
  unit,
  path,
  onShowLabel,
  onDeleted,
  onPickSeveral,
}: UnitMenuProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<OpenSheet>(null);
  const parent = path.at(-2) ?? null;
  const close = (): void => {
    setOpen(null);
  };

  const actions: readonly OverflowAction[] = [
    ...(onPickSeveral === undefined
      ? []
      : [{ label: t("items.selectSeveral"), icon: "check" as const, onSelect: onPickSeveral }]),
    /*
      A box for a box, the same shape the column used to carry it with: what is
      about to be added is a container and not a thing, and that distinction is
      the only one separating this line from "Add an item" outside.
    */
    {
      label: t("units.addInside"),
      icon: "box" as const,
      onSelect: () => {
        setOpen("add");
      },
    },
    { label: t("units.showLabel"), icon: "tag", onSelect: onShowLabel },
    {
      label: t("action.edit"),
      icon: "pencil",
      onSelect: () => {
        setOpen("edit");
      },
    },
    {
      label: t("action.move"),
      icon: "move",
      onSelect: () => {
        setOpen("move");
      },
    },
    /*
      Emptying takes the contents out and keeps the box, so it is not drawn in
      the danger colour — nothing is deleted by it. It is still marked
      destructive, because what it costs is measured in where everything you
      own ends up. No icon, for the reason there never was one: no shape means
      "empty this box but keep it".
    */
    {
      label: t("action.empty"),
      destructive: true,
      onSelect: () => {
        setOpen("empty");
      },
    },
    {
      label: t("action.delete"),
      icon: "trash",
      tone: "danger",
      destructive: true,
      onSelect: () => {
        setOpen("delete");
      },
    },
  ];

  return (
    <>
      <OverflowMenu label={t("action.more", { name: unit.name })} actions={actions} />

      {open === "add" ? (
        <CreateUnitSheet parentId={unit.id} parentName={unit.name} onClose={close} />
      ) : null}
      {open === "edit" ? <EditUnitSheet unit={unit} onClose={close} /> : null}
      {open === "move" ? <MoveUnitSheet unit={unit} onClose={close} /> : null}
      {open === "empty" ? (
        <EmptyUnitSheet unit={unit} parent={parent} onClose={close} />
      ) : null}
      {open === "delete" ? (
        <DeleteUnitSheet
          unit={unit}
          parent={parent}
          onClose={close}
          onDeleted={() => {
            close();
            onDeleted();
          }}
        />
      ) : null}
    </>
  );
};
