import type { StorageUnitView } from "@ariadna/api-client";
import { useState, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { CreateUnitDialog } from "./create-unit-dialog.js";
import { DeleteUnitDialog } from "./delete-unit-dialog.js";
import { EditUnitDialog } from "./edit-unit-dialog.js";
import { EmptyUnitDialog } from "./empty-unit-dialog.js";
import { MoveUnitDialog } from "./move-unit-dialog.js";
import { ROUTES, labelsWithinPath, findWithinPath, unitLabelPath, unitPath } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

export interface UnitActionsProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit; the step before last is its parent. */
  readonly path: readonly StorageUnitView[];
}

type OpenDialog = "create" | "edit" | "move" | "empty" | "delete" | null;

/**
 * Everything that can be done to a storage unit, and the sheets that ask.
 *
 * A container: it owns which sheet is open and nothing else. Each sheet owns
 * its own request and its own refusal, which is why the not-empty conflict
 * can offer to empty the box without any of this knowing that deleting can
 * even be refused.
 *
 * "Edit" and "Move" are separate buttons because they are separate things.
 * Editing changes what the unit SAYS about itself and is a `PATCH` that
 * cannot carry a parent; moving changes where it IS and is guarded by the
 * subtree invariant (ADR 2). One button for both would hide the second
 * behind the first.
 */
export const UnitActions = ({ unit, path }: UnitActionsProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<OpenDialog>(null);
  const navigate = useNavigate();
  const parent = path.at(-2) ?? null;

  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen("create");
        }}
      >
        {t("units.addInside")}
      </Button>
      <Button
        onClick={() => {
          setOpen("edit");
        }}
      >
        {t("action.edit")}
      </Button>
      <Button
        onClick={() => {
          setOpen("move");
        }}
      >
        {t("action.move")}
      </Button>
      <Button
        onClick={() => {
          setOpen("empty");
        }}
      >
        {t("action.empty")}
      </Button>
      <Button
        tone="danger"
        onClick={() => {
          setOpen("delete");
        }}
      >
        {t("action.delete")}
      </Button>
      <Link className="button button--secondary" to={findWithinPath(unit.id)}>
        {t("units.searchInside")}
      </Link>
      <Link className="button button--secondary" to={unitLabelPath(unit.id)}>
        {t("units.showLabel")}
      </Link>
      {/*
        One label and a sheet of them are two different jobs: sticking a
        label on THIS box, and labelling everything it holds in one
        afternoon. `?within=` means the same as it does on a search — what is
        inside, not the unit itself (ADR 11).
      */}
      <Link className="button button--secondary" to={labelsWithinPath(unit.id)}>
        {t("label.sheet")}
      </Link>

      {open === "create" ? (
        <CreateUnitDialog parentId={unit.id} onClose={close} />
      ) : null}

      {open === "edit" ? <EditUnitDialog unit={unit} onClose={close} /> : null}

      {open === "move" ? <MoveUnitDialog unit={unit} onClose={close} /> : null}

      {open === "empty" ? (
        <EmptyUnitDialog unit={unit} parent={parent} onClose={close} />
      ) : null}

      {open === "delete" ? (
        <DeleteUnitDialog
          unit={unit}
          parent={parent}
          onClose={close}
          onDeleted={() => {
            close();
            // Standing on the screen of a unit that no longer exists is how a
            // delete ends in a 404 the person thinks they caused.
            navigate(parent === null ? ROUTES.inventory : unitPath(parent.id), {
              replace: true,
            });
          }}
        />
      ) : null}
    </>
  );
};
