import type { StorageUnitView } from "@waymark/api-client";
import { useState, type JSX } from "react";
import { Link } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Icon } from "../ui/atoms/icon.js";
import { CreateItemDialog } from "../items/create-item-dialog.js";
import { findWithinPath } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

export interface UnitActionsProps {
  readonly unit: StorageUnitView;
}

/**
 * What somebody standing in front of a box is here to do.
 *
 * Two controls, and they are the only two on this screen that are not behind
 * the menu — because they are the two reasons anybody opens a box's screen
 * with an intention rather than a question. Everything else that can be done
 * to this unit is in `UnitMenu`, beside its name (ADR 21).
 *
 * ## Which two, and why it is not the two it started as
 *
 * It shipped as "Add an item" and "Add a space inside", and the owner used it
 * on his phone and said what the second one should have been:
 *
 * > dentro de un espacio, quiero que las acciones principales sean buscar y
 * > añadir un objeto
 *
 * He is right, and the reason is the box. Somebody who has walked to a shelf
 * and opened its screen is either putting something in it or looking for
 * something in it. Growing a drawer inside it is a thing you do once, when the
 * shelf is new — so it went into the menu and searching took its place. A swap
 * and not an addition: still one primary, still one secondary.
 *
 * The primary is the one that CHANGES something and the secondary is the one
 * that only looks, which is also why the second is a `<Link>`. A scoped search
 * is a URL somebody can send across a house (ADR 11), and it belongs in the
 * history so that Back leaves the search rather than un-typing it.
 *
 * It owns the one dialog it opens and nothing else. The dialog owns its own
 * request and its own refusal.
 */
export const UnitActions = ({ unit }: UnitActionsProps): JSX.Element => {
  const t = useTranslate();

  const [adding, setAdding] = useState(false);

  return (
    <>
      <Button
        tone="primary"
        icon="plus"
        onClick={() => {
          setAdding(true);
        }}
      >
        {t("units.addItem")}
      </Button>
      {/*
        The two shapes say what KIND of intention each one is: a plus for
        something arriving, a magnifier for something being looked for. Two
        identical pluses is the state this whole change is getting out of —
        the eye left to read the words to tell two controls apart.
      */}
      <Link className="button button--secondary" to={findWithinPath(unit.id)}>
        <Icon name="search" size={18} />
        {t("units.searchInside")}
      </Link>

      {adding ? (
        <CreateItemDialog
          storageUnitId={unit.id}
          unitName={unit.name}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </>
  );
};
