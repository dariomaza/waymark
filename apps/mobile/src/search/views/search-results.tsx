import type { ItemSearchResultView, SearchResponse } from "@waymark/api-client";
import { SearchMatchField } from "@waymark/domain";
import type { Translate } from "@waymark/i18n";
import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ItemGrid } from "../../items/views/item-grid.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { colors, space, text } from "../../ui/styles/tokens.js";
import { FIELD_KEYS, SearchHit, whyItMatched } from "./search-hit.js";
import { useTranslate } from "../../app/language-context.js";

export interface SearchResultsProps {
  readonly results: SearchResponse;
  readonly onOpenItem: (id: string) => void;
  readonly onOpenUnit: (id: string) => void;
  /** The cover photo for one result, when it has one. Injected; see `ItemCover`. */
  readonly itemPhoto?: (result: ItemSearchResultView) => ReactNode;
}

/**
 * Two lists, never one.
 *
 * Items and storage units answer two different questions — "where is my
 * drill" and "where is Box 3" — and interleaving them would need a made-up
 * rule for whether a box called `Cables` beats an item tagged `cables`. The
 * API refuses to invent one; so does this.
 *
 * # What a card can carry, and what it says out loud
 *
 * A result card is a third of a phone wide, so its one line carries the box
 * to walk to first — that is the answer — and the reason second, because an
 * item called `HDMI 2.1` answering a search for `cables` looks like a bug
 * until the card says "tag", and then it looks like the feature working. A
 * match on the NAME needs no explaining and is left out. The web client's
 * cards say exactly this, in this order.
 *
 * The whole breadcrumb is not dropped, it moves: it is what the card is
 * NAMED, so a screen reader still hears "Cordless drill, Garage > Metal
 * wardrobe > Box 3". A card has one accessible name and the path is the
 * answer to the question this screen asks (ADR 15), so that is what it spends
 * it on.
 *
 * Storage units stay rows with their whole breadcrumb visible: a box is
 * recognised by its name and the label stuck on it, not by a photograph of a
 * box.
 */
export const SearchResults = ({
  results,
  onOpenItem,
  onOpenUnit,
  itemPhoto,
}: SearchResultsProps): JSX.Element => {
  const t = useTranslate();

  if (results.items.length === 0 && results.storageUnits.length === 0) {
    return (
      <EmptyNote explains={t("search.noneExplains")}>
        {t("search.nothingMatches", { query: results.query })}
      </EmptyNote>
    );
  }

  const units =
    results.storageUnits.length === 0 ? null : (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          {t("search.units")}
        </Text>
        <View style={styles.list} accessibilityLabel={t("search.unitsFound")}>
          {results.storageUnits.map((hit) => (
            <SearchHit
              key={hit.unit.id}
              title={hit.unit.name}
              location={hit.location}
              matchedFields={hit.matchedFields}
              onPress={() => {
                onOpenUnit(hit.unit.id);
              }}
            />
          ))}
        </View>
      </View>
    );

  // No grid at all when nothing matched among the things: an empty list still
  // announces itself, and "items found" over nothing is a lie a screen reader
  // has no way to see through.
  if (results.items.length === 0) {
    return <View style={styles.wrap}>{units}</View>;
  }

  return (
    <ItemGrid
      label={t("search.itemsFound")}
      cells={results.items.map((hit) => ({
        key: hit.item.id,
        name: hit.item.name,
        secondary: whereAndWhy(t, hit.path.at(-1)?.name, hit.matchedFields),
        quantity: hit.item.quantity,
        label: spokenName(t, hit),
        photo: itemPhoto?.(hit),
        onPress: () => {
          onOpenItem(hit.item.id);
        },
      }))}
      header={
        <Text accessibilityRole="header" style={styles.heading}>
          {t("search.items")}
        </Text>
      }
      {...(units === null ? {} : { footer: units })}
    />
  );
};

/**
 * The one line a card has, carrying two things a search result cannot do
 * without: where to walk, and why this is here at all.
 *
 * A row had space for the whole path and its own badge; a square does not,
 * and this is the cost of the grid.
 */
const whereAndWhy = (
  t: Translate,
  where: string | undefined,
  matched: readonly SearchMatchField[],
): string | undefined =>
  [where, ...explainable(matched).map((field) => t(FIELD_KEYS[field]))]
    .filter((part) => part !== undefined && part !== "")
    .join(" \u00b7 ") || undefined;

/** What a screen reader hears: the whole path, and the reason when there is one. */
const spokenName = (t: Translate, hit: ItemSearchResultView): string => {
  const why = explainable(hit.matchedFields);

  return why.length === 0
    ? `${hit.item.name}, ${hit.location}`
    : `${hit.item.name}, ${hit.location}, ${whyItMatched(t, why)}`;
};

/** Every reason but the obvious one. A match on the name explains itself. */
const explainable = (matched: readonly SearchMatchField[]): readonly SearchMatchField[] =>
  matched.filter((field) => field !== SearchMatchField.NAME);

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  section: { gap: space.s2, marginTop: space.s4 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  list: { gap: space.s2 },
});
