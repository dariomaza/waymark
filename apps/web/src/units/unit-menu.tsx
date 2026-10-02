import { findTreeNode, type SpacePermissionsView, type StorageUnitView } from "@waymark/api-client";
import { ShareLevel } from "@waymark/domain";
import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";

import { OverflowMenu, type OverflowAction } from "../ui/molecules/overflow-menu.js";
import { CreateUnitDialog } from "./create-unit-dialog.js";
import { DeleteUnitDialog } from "./delete-unit-dialog.js";
import { EditUnitDialog } from "./edit-unit-dialog.js";
import { EmptyUnitDialog } from "./empty-unit-dialog.js";
import { MoveUnitDialog } from "./move-unit-dialog.js";
import { ShareUnitDialog } from "./share-unit-dialog.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { useIsAdministrator } from "../auth/people-queries.js";
import { ROUTES, unitLabelPath, unitPath } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

export interface UnitMenuProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit; the step before last is its parent. */
  readonly path: readonly StorageUnitView[];
  /**
   * What the person may do with it (ADR 26); `null` while that is not known,
   * which offers only what changes nothing.
   */
  readonly permissions: SpacePermissionsView | null;
}

type OpenDialog = "add" | "share" | "edit" | "move" | "empty" | "delete" | null;

/**
 * # Everything that can be done TO a storage unit
 *
 * It sits beside the unit's name rather than in the row of things to do,
 * because that is what these acts are ABOUT. Renaming a box, moving it,
 * emptying it and throwing it away are not things you do on this screen; they
 * are things you do to the box the screen is showing you, and a heading is
 * where a phone has put a subject's own menu for as long as phones have had
 * menus. ADR 21 is the rule, and this is the first place it is kept.
 *
 * Six lines, in the order somebody reaches for them:
 *
 * 1. **Add a space inside** — the one line here that makes something, and the
 *    one that used to stand in the row outside. It was demoted because a shelf
 *    holds things a hundred times for every time it grows a drawer, and the
 *    owner wanted the row to say searching instead; it is first IN here
 *    because of that same count — of everything left behind this control, it
 *    is what gets reached for most.
 * 2. **Show the label** — this box's own label, looking at something and
 *    changing nothing. A SHEET of labels used to sit beside it, scoped to this
 *    unit, and it was a category error: a page of labels for everything a box
 *    holds is not an act on the box. It is on the home screen, where the whole
 *    house is.
 * 3. **Edit** and **Move** — two acts, not one "manage", because editing
 *    changes what the unit SAYS about itself and is a `PATCH` that cannot
 *    carry a parent, while moving changes where it IS and is guarded by the
 *    subtree invariant (ADR 2, ADR 14). One control for both would hide the
 *    second behind the first.
 * 4. **Empty** and **Delete** — the two that take something away, last, behind
 *    a rule, as far from the screen's primary action as this menu goes. A
 *    thumb reaching for "Add an item" cannot land on either.
 *
 * Searching is NOT here any more: it is the screen's secondary action now, in
 * the row, where the owner asked for it.
 *
 * A container: it owns which sheet is open and nothing else. Each sheet owns
 * its own request and its own refusal, which is why the not-empty conflict can
 * offer to empty the box without any of this knowing that deleting can even be
 * refused.
 */
export const UnitMenu = ({ unit, path, permissions }: UnitMenuProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<OpenDialog>(null);
  const navigate = useNavigate();
  const parent = path.at(-2) ?? null;

  const close = (): void => {
    setOpen(null);
  };

  const mayChange = permissions?.access === ShareLevel.EDIT;
  const isAdministrator = useIsAdministrator();
  const tree = useStorageUnitTree();

  /*
    A box for a box, the same shape the row used to carry it with: what is
    about to be added is a container and not a thing, and that distinction is
    the only one separating this line from "Add an item" outside.
  */
  const addInside: OverflowAction = {
    label: t("units.addInside"),
    icon: "box",
    onSelect: () => {
      setOpen("add");
    },
  };

  /*
    This box's OWN label, and only that. A sheet of every label in the house
    used to sit on the next line, scoped to this unit, and it was a category
    error: this menu is what can be done TO this box, and a page of labels
    for everything it holds is a different errand that happened to be wearing
    the same words. It lives on the home screen now, which is where the
    whole house is.
  */
  const showLabel: OverflowAction = {
    label: t("units.showLabel"),
    icon: "tag",
    to: unitLabelPath(unit.id),
  };

  /*
    Who else may look at it, or change it (ADR 26). Only an administrator
    shares, so only an administrator is offered it; the API refuses anybody
    else regardless.
  */
  const share: OverflowAction = {
    label: t("units.share"),
    icon: "person",
    onSelect: () => {
      setOpen("share");
    },
  };

  const edit: OverflowAction = {
    label: t("action.edit"),
    icon: "pencil",
    onSelect: () => {
      setOpen("edit");
    },
  };

  const move: OverflowAction = {
    label: t("action.move"),
    icon: "move",
    onSelect: () => {
      setOpen("move");
    },
  };

  /*
    Emptying takes the contents out and keeps the box, so it is not drawn in
    the danger colour — nothing is deleted by it. It is still marked
    destructive, because what it costs is measured in where everything you
    own ends up, and that belongs at the far end of the list with Delete.
    There is no icon for the same reason there never was: no shape means
    "empty this box but keep it".
  */
  const empty: OverflowAction = {
    label: t("action.empty"),
    destructive: true,
    onSelect: () => {
      setOpen("empty");
    },
  };

  const remove: OverflowAction = {
    label: t("action.delete"),
    icon: "trash",
    tone: "danger",
    destructive: true,
    onSelect: () => {
      setOpen("delete");
    },
  };

  /*
    A space shared to look at keeps only its label (ADR 26). Moving has its
    own answer, because it needs edit on the space AND on where it is, which
    the API has already worked out as `mayMove`.
  */
  const actions: readonly OverflowAction[] = [
    ...(mayChange ? [addInside] : []),
    showLabel,
    ...(isAdministrator ? [share] : []),
    ...(mayChange ? [edit] : []),
    ...(permissions?.mayMove === true ? [move] : []),
    ...(mayChange ? [empty, remove] : []),
  ];

  return (
    <>
      <OverflowMenu label={t("action.more", { name: unit.name })} actions={actions} />

      {open === "add" ? <CreateUnitDialog parentId={unit.id} onClose={close} /> : null}

      {open === "share" ? (
        <ShareUnitDialog
          unit={unit}
          ownerId={findTreeNode(tree.data?.tree ?? [], unit.id)?.owner?.id ?? null}
          onClose={close}
        />
      ) : null}

      {open === "edit" ? <EditUnitDialog unit={unit} onClose={close} /> : null}

      {open === "move" ? (
        <MoveUnitDialog
          unit={unit}
          mayMoveToTop={permissions?.mayMoveToTop === true}
          onClose={close}
        />
      ) : null}

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
