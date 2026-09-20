import type { JSX } from "react";

import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { UnitTree } from "./views/unit-tree.js";

/**
 * The home screen: everything you own, as the tree it is stored in.
 *
 * A container. It fetches, it decides between the four states a fetch has,
 * and it hands the data to a component that only knows how to draw a tree.
 *
 * A location IS a storage unit (ADR 1), so there is nothing else to show at
 * the top: the roots ARE the house.
 */
export const InventoryScreen = (): JSX.Element => {
  const tree = useStorageUnitTree();

  return (
    <main className="screen">
      <h2>Your inventory</h2>

      {tree.isPending ? <Loading label="Loading your inventory" /> : null}

      {tree.isError ? (
        <FailureNote
          error={tree.error}
          onRetry={() => {
            void tree.refetch();
          }}
        />
      ) : null}

      {tree.isSuccess && tree.data.tree.length === 0 ? (
        <EmptyNote>Nothing stored yet. Add a room, a shelf or a box to start.</EmptyNote>
      ) : null}

      {tree.isSuccess && tree.data.tree.length > 0 ? (
        <UnitTree nodes={tree.data.tree} />
      ) : null}
    </main>
  );
};
