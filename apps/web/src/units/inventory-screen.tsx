import type { JSX } from "react";

/**
 * The home screen: everything you own, as the tree it is stored in.
 *
 * A location IS a storage unit (ADR 1), so there is nothing else to show at
 * the top: the roots ARE the house.
 */
export const InventoryScreen = (): JSX.Element => (
  <main className="screen">
    <h2>Your inventory</h2>
  </main>
);
