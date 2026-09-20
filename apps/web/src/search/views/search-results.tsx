import type { SearchResponse } from "@ariadna/api-client";
import type { JSX } from "react";

import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { SearchHit } from "./search-hit.js";

export interface SearchResultsProps {
  readonly results: SearchResponse;
}

/**
 * Two lists, never one.
 *
 * Items and storage units answer two different questions — "where is my
 * drill" and "where is Box 3" — and interleaving them would need a made-up
 * rule for whether a box called `Cables` beats an item tagged `cables`. The
 * API refuses to invent one; so does this.
 */
export const SearchResults = ({ results }: SearchResultsProps): JSX.Element => {
  const nothing = results.items.length === 0 && results.storageUnits.length === 0;

  if (nothing) {
    return (
      <EmptyNote>
        Nothing matches “{results.query}”. Try fewer words — every one of them has
        to match.
      </EmptyNote>
    );
  }

  return (
    <>
      {results.items.length === 0 ? null : (
        <section>
          <h3>Items</h3>
          <ul aria-label="Items found">
            {results.items.map((hit) => (
              <SearchHit
                key={hit.item.id}
                title={hit.item.name}
                to={`/items/${hit.item.id}`}
                location={hit.location}
                matchedFields={hit.matchedFields}
                {...(hit.item.quantity > 1
                  ? { detail: `Quantity ${String(hit.item.quantity)}` }
                  : {})}
              />
            ))}
          </ul>
        </section>
      )}

      {results.storageUnits.length === 0 ? null : (
        <section>
          <h3>Storage units</h3>
          <ul aria-label="Storage units found">
            {results.storageUnits.map((hit) => (
              <SearchHit
                key={hit.unit.id}
                title={hit.unit.name}
                to={`/units/${hit.unit.id}`}
                location={hit.location}
                matchedFields={hit.matchedFields}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
};
