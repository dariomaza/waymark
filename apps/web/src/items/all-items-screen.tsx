import type { JSX } from "react";

import { Loading } from "../ui/atoms/loading.js";
import { EmptyNote } from "../ui/molecules/empty-note.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { RowLink } from "../ui/molecules/row-link.js";
import { useEveryItem } from "./item-queries.js";

/**
 * Every item in the house, each with where it is.
 *
 * One request, one answer, in the order the API sent it. The location is not
 * decoration on the row — it is the point of the screen, which is why it is
 * never a list of bare names.
 */
export const AllItemsScreen = (): JSX.Element => {
  const everything = useEveryItem();
  const rows = everything.data?.items ?? [];

  return (
    <main className="screen">
      <h2>Everything you own</h2>

      {everything.isPending ? <Loading label="Gathering every item" /> : null}

      {everything.isError ? (
        <FailureNote
          error={everything.error}
          onRetry={() => {
            void everything.refetch();
          }}
        />
      ) : null}

      {everything.isSuccess && rows.length === 0 ? (
        <EmptyNote>No items yet. Open a unit and add one.</EmptyNote>
      ) : null}

      {rows.length === 0 ? null : (
        <ul aria-label="Every item">
          {rows.map((row) => (
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
