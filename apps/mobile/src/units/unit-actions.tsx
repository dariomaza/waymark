import type { StorageUnitView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { CreateItemSheet } from "../items/create-item-sheet.js";
import { Button } from "../ui/atoms/button.js";
import { useTranslate } from "../app/language-context.js";

export interface UnitActionsProps {
  readonly unit: StorageUnitView;
  /**
   * Into the search tab, already scoped to this box.
   *
   * Injected rather than navigated here for the same reason `UnitMenu` takes
   * `onShowLabel`: this component would otherwise need to know that the search
   * screen is a TAB inside the root stack, which is the navigator's business
   * and not a box's.
   */
  readonly onSearchInside: () => void;
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
 * It shipped as "Add an item" and "Add a space inside", and the owner used the
 * browser on his phone and said what the second one should have been:
 *
 * > dentro de un espacio, quiero que las acciones principales sean buscar y
 * > añadir un objeto
 *
 * That is a statement about the box and not about a client, so this one
 * answers it too — and it answers it by GAINING something. The browser at
 * least had a scoped search behind its menu; this app had none anywhere, even
 * though the search tab has read a `within` parameter all along. A capability
 * reachable from nowhere is a capability that does not exist.
 *
 * Growing a drawer inside a shelf is a thing you do once, when the shelf is
 * new, so it went into the menu and searching took its place. A swap and not
 * an addition: still one primary, still one secondary.
 *
 * The two shapes say what KIND of intention each one is — a plus for something
 * arriving, a magnifier for something being looked for — so a thumb lands on
 * the right one without reading either.
 */
export const UnitActions = ({ unit, onSearchInside }: UnitActionsProps): JSX.Element => {
  const t = useTranslate();

  const [adding, setAdding] = useState(false);

  return (
    <>
      <Button
        tone="primary"
        icon="plus"
        onPress={() => {
          setAdding(true);
        }}
      >
        {t("units.addItem")}
      </Button>
      <Button icon="search" onPress={onSearchInside}>
        {t("units.searchInside")}
      </Button>

      {adding ? (
        <CreateItemSheet
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
