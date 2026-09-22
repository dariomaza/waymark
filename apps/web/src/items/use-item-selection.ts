import type { ItemId } from "@waymark/domain";
import { useCallback, useState } from "react";

export interface ItemSelection {
  readonly selected: readonly ItemId[];
  isSelected(id: ItemId): boolean;
  toggle(id: ItemId): void;
  clear(): void;
}

/**
 * Which items are ticked, for a bulk move.
 *
 * Order is insertion order, which is what the person picked — the API takes
 * the list as given and moves all of them or none.
 */
export const useItemSelection = (): ItemSelection => {
  const [selected, setSelected] = useState<readonly ItemId[]>([]);

  const toggle = useCallback((id: ItemId) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
  }, []);

  const clear = useCallback(() => {
    setSelected([]);
  }, []);

  return {
    selected,
    isSelected: (id) => selected.includes(id),
    toggle,
    clear,
  };
};
