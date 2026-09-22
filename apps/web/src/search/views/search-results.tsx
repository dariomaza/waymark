import type { SearchResponse } from "@waymark/api-client";
import { SearchMatchField } from "@waymark/domain";
import type { Translate } from "@waymark/i18n";
import type { JSX } from "react";

import { ItemCard } from "../../items/views/item-card.js";
import { ItemCover } from "../../photos/item-cover.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { FIELD_KEYS, SearchHit } from "./search-hit.js";
import { thingPath, unitPath } from "../../app/routes.js";
import { useTranslate } from "../../app/language-context.js";

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
  const t = useTranslate();

  const nothing = results.items.length === 0 && results.storageUnits.length === 0;

  if (nothing) {
    return (
      <EmptyNote explains={t("search.noneExplains")}>
        {t("search.nothingMatches", { query: results.query })}
      </EmptyNote>
    );
  }

  return (
    <>
      {results.items.length === 0 ? null : (
        <section>
          <h3>{t("search.items")}</h3>
          {/**
           * A grid here too, at the user's choice and against my advice: a
           * card has no room for `Garage › Wardrobe › Box 3`, and in this
           * screen the location is the answer to the question being asked.
           *
           * What a card DOES hold is the last step of that path, which is
           * most of the answer — the box to walk to. The full breadcrumb is
           * one tap away in the thing's own screen.
           */}
          <ul className="item-grid" aria-label={t("search.itemsFound")}>
            {results.items.map((hit) => (
              <li key={hit.item.id}>
                <ItemCard
                  to={thingPath(hit.item.id)}
                  name={hit.item.name}
                  secondary={whereAndWhy(t, hit.path.at(-1)?.name, hit.matchedFields)}
                  quantity={hit.item.quantity}
                  photo={<ItemCover item={hit.item} />}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.storageUnits.length === 0 ? null : (
        <section>
          <h3>{t("search.units")}</h3>
          <ul aria-label={t("search.unitsFound")}>
            {results.storageUnits.map((hit) => (
              <SearchHit
                key={hit.unit.id}
                title={hit.unit.name}
                to={unitPath(hit.unit.id)}
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

/**
 * The one line a card has, carrying two things a search result cannot do
 * without.
 *
 * The box to walk to comes first, because it is the answer. The reason comes
 * second, because an item called `HDMI 2.1` answering a search for `cables`
 * looks like a bug until the card says "tag", and then it looks like the
 * feature working. A match on the name needs no explaining and is left out.
 *
 * Both in one line is the cost of the grid: a row had space for the whole
 * path and its own badge, and a square does not.
 */
const whereAndWhy = (
  t: Translate,
  where: string | undefined,
  matched: readonly SearchMatchField[],
): string | undefined => {
  // The same words the row below uses, from the same keys. This file used to
  // keep its own copy of them, which is how one list came to say "tag" while
  // the other was translated.
  const why = matched
    .filter((field) => field !== SearchMatchField.NAME)
    .map((field) => t(FIELD_KEYS[field]));

  return [where, ...why].filter((part) => part !== undefined && part !== "").join(" \u00b7 ") || undefined;
};
