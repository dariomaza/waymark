import type { ItemSearchResultView, SearchResponse } from "@ariadna/api-client";
import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ItemGrid } from "../../items/views/item-grid.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { colors, space, text } from "../../ui/styles/tokens.js";
import { SearchHit, whyItMatched } from "./search-hit.js";

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
 * A result card is a third of a phone wide, so its one spare line is the BOX
 * the thing is in — the place somebody is about to walk to. The rest of the
 * answer is not dropped: the whole breadcrumb and WHY the result matched are
 * what the card is NAMED, so a screen reader still hears "Cordless drill,
 * Garage > Metal wardrobe > Box 3, matched name".
 *
 * That "why" is not decoration. An item called `HDMI 2.1` answering a search
 * for `cables` looks like a mistake until something says "matched tag", and
 * then it looks like the feature working.
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
  if (results.items.length === 0 && results.storageUnits.length === 0) {
    return (
      <EmptyNote explains="Try fewer words — every one of them has to match.">
        {`Nothing matches “${results.query}”`}
      </EmptyNote>
    );
  }

  const units =
    results.storageUnits.length === 0 ? null : (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          Storage units
        </Text>
        <View style={styles.list} accessibilityLabel="Storage units found">
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
      label="Items found"
      cells={results.items.map((hit) => ({
        key: hit.item.id,
        name: hit.item.name,
        secondary: hit.path.at(-1)?.name,
        quantity: hit.item.quantity,
        label: `${hit.item.name}, ${hit.location}, ${whyItMatched(hit.matchedFields)}`,
        photo: itemPhoto?.(hit),
        onPress: () => {
          onOpenItem(hit.item.id);
        },
      }))}
      header={
        <Text accessibilityRole="header" style={styles.heading}>
          Items
        </Text>
      }
      {...(units === null ? {} : { footer: units })}
    />
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  section: { gap: space.s2, marginTop: space.s4 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  list: { gap: space.s2 },
});
