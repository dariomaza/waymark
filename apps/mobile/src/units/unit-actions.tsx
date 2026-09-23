import type { StorageUnitView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { CreateUnitSheet } from "./create-unit-sheet.js";
import { DeleteUnitSheet } from "./delete-unit-sheet.js";
import { EditUnitSheet } from "./edit-unit-sheet.js";
import { EmptyUnitSheet } from "./empty-unit-sheet.js";
import { MoveUnitSheet } from "./move-unit-sheet.js";
import { useTranslate } from "../app/language-context.js";

export interface UnitActionsProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit; the step before last is its parent. */
  readonly path: readonly StorageUnitView[];
  readonly onShowLabel: () => void;
  readonly onDeleted: () => void;
}

type OpenSheet = "add" | "edit" | "move" | "empty" | "delete" | null;

/**
 * What can be done to a unit.
 *
 * Edit and Move are separate buttons, not one "manage" screen: they are
 * separate acts, and only one of them can make the inventory lie about where
 * something is (ADR 14).
 */
export const UnitActions = ({
  unit,
  path,
  onShowLabel,
  onDeleted,
}: UnitActionsProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<OpenSheet>(null);
  const parent = path.at(-2) ?? null;
  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      {/*
        Six controls stacked down a phone, and until now six identical
        word-buttons — which is a wall a thumb has to READ to use. The
        pictures are what make one of them findable at a glance; the words
        stay, because no shape means "empty this box but keep it".
      */}
      <Button
        icon="plus"
        onPress={() => {
          setOpen("add");
        }}
      >
        {t("units.addInside")}
      </Button>
      <Button
        icon="pencil"
        onPress={() => {
          setOpen("edit");
        }}
      >
        {t("action.edit")}
      </Button>
      <Button
        icon="move"
        onPress={() => {
          setOpen("move");
        }}
      >
        {t("action.move")}
      </Button>
      <Button
        onPress={() => {
          setOpen("empty");
        }}
      >
        {t("action.empty")}
      </Button>
      <Button onPress={onShowLabel}>{t("units.showLabel")}</Button>
      <Button
        tone="danger"
        icon="trash"
        onPress={() => {
          setOpen("delete");
        }}
      >
        {t("action.delete")}
      </Button>

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
