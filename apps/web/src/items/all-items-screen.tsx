import type { JSX } from "react";

import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { RowLink } from "../ui/molecules/row-link.js";
import { useEveryItem } from "./item-queries.js";

/**
 * Every item in the house, each with where it is.
 *
 * This screen is assembled rather than fetched: see `useEveryItem` for why,
 * and for what it costs.
 */
export const AllItemsScreen = (): JSX.Element => {
  const everything = useEveryItem();

  return (
    <main className="screen">
      <h2>Everything you own</h2>

      {everything.isPending ? <Loading label="Gathering every item" /> : null}

      {everything.error === null ? null : (
        <FailureNote error={everything.error} onRetry={everything.refetch} />
      )}

      {!everything.isPending && everything.rows.length === 0 ? (
        <EmptyNote>No items yet. Open a unit and add one.</EmptyNote>
      ) : null}

      {everything.rows.length === 0 ? null : (
        <ul aria-label="Every item">
          {everything.rows.map((row) => (
            <li key={row.item.id}>
              <RowLink
                to={`/items/${row.item.id}`}
                title={row.item.name}
                meta={row.location}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
