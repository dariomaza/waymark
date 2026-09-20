import { useState, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { StorageUnitView } from "../api/contract.js";
import { Button } from "../ui/atoms/button.js";
import { CreateUnitDialog } from "./create-unit-dialog.js";
import { DeleteUnitDialog } from "./delete-unit-dialog.js";
import { EmptyUnitDialog } from "./empty-unit-dialog.js";
import { MoveUnitDialog } from "./move-unit-dialog.js";

export interface UnitActionsProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit; the step before last is its parent. */
  readonly path: readonly StorageUnitView[];
}

type OpenDialog = "create" | "move" | "empty" | "delete" | null;

/**
 * Everything that can be done to a storage unit, and the sheets that ask.
 *
 * A container: it owns which sheet is open and nothing else. Each sheet owns
 * its own request and its own refusal, which is why the not-empty conflict
 * can offer to empty the box without any of this knowing that deleting can
 * even be refused.
 *
 * There is no "edit": the API exposes create, move, empty and delete and no
 * general update, deliberately (see `storage-unit-routes.ts`). A rename would
 * need a route that does not exist, and inventing one in the client is not
 * something a client can do.
 */
export const UnitActions = ({ unit, path }: UnitActionsProps): JSX.Element => {
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
        Add a unit inside
      </Button>
      <Button
        onClick={() => {
          setOpen("move");
        }}
      >
        Move
      </Button>
      <Button
        onClick={() => {
          setOpen("empty");
        }}
      >
        Empty
      </Button>
      <Button
        tone="danger"
        onClick={() => {
          setOpen("delete");
        }}
      >
        Delete
      </Button>
      <Link className="button button--secondary" to={`/search?within=${unit.id}`}>
        Search inside
      </Link>

      {open === "create" ? (
        <CreateUnitDialog parentId={unit.id} onClose={close} />
      ) : null}

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
            navigate(parent === null ? "/" : `/units/${parent.id}`, { replace: true });
          }}
        />
      ) : null}
    </>
  );
};
