import type { ItemId } from "@waymark/domain";
import { useCallback, useState } from "react";

export interface ItemSelection {
  /**
   * Whether a tap TICKS rather than opens.
   *
   * This is the one thing the web client's version does not have, and the
   * reason is the screen. A browser can keep a tick box beside every row for
   * ever at the cost of one column; a grid of photographs three across on a
   * phone has no column to give, and a permanent tick on every card would
   * cover the picture that is the whole reason a thing is drawn as a square.
   *
   * So picking is a mode, and it is held HERE rather than inferred from the
   * selection being non-empty — otherwise unticking the last thing would hand
   * the next tap back to opening a screen, halfway through choosing.
   */
  readonly picking: boolean;
  /** Insertion order, which is the order somebody picked them in. */
  readonly selected: readonly ItemId[];
  isSelected(id: ItemId): boolean;
  /** Turns the mode on with nothing picked, for the button that says so. */
  start(): void;
  /** Ticks or unticks, and turns the mode on if it was not already. */
  toggle(id: ItemId): void;
  /** Leaves the mode and forgets everything. The one way out. */
  clear(): void;
}

/**
 * Which items are ticked, for a bulk move.
 *
 * The API takes the list as given and moves all of them or none (ADR 3), so
 * the order is the person's and nothing here sorts it.
 */
export const useItemSelection = (): ItemSelection => {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<readonly ItemId[]>([]);

  const start = useCallback(() => {
    setPicking(true);
  }, []);

  const toggle = useCallback((id: ItemId) => {
    setPicking(true);
    setSelected((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
  }, []);

  const clear = useCallback(() => {
    setPicking(false);
    setSelected([]);
  }, []);

  return {
    picking,
    selected,
    isSelected: (id) => selected.includes(id),
    start,
    toggle,
    clear,
  };
};
