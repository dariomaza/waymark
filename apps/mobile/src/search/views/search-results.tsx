import type { SearchResponse } from "@ariadna/api-client";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { colors, space, text } from "../../ui/styles/tokens.js";
import { SearchHit } from "./search-hit.js";

export interface SearchResultsProps {
  readonly results: SearchResponse;
  readonly onOpenItem: (id: string) => void;
  readonly onOpenUnit: (id: string) => void;
}

/**
 * Two lists, never one.
 *
 * Items and storage units answer two different questions — "where is my
 * drill" and "where is Box 3" — and interleaving them would need a made-up
 * rule for whether a box called `Cables` beats an item tagged `cables`. The
 * API refuses to invent one; so does this.
 */
export const SearchResults = ({
  results,
  onOpenItem,
  onOpenUnit,
}: SearchResultsProps): JSX.Element => {
  if (results.items.length === 0 && results.storageUnits.length === 0) {
    return (
      <EmptyNote>
        {`Nothing matches “${results.query}”. Try fewer words — every one of them has to match.`}
      </EmptyNote>
    );
  }

  return (
    <View style={styles.wrap}>
      {results.items.length === 0 ? null : (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>
            Items
          </Text>
          <View style={styles.list} accessibilityLabel="Items found">
            {results.items.map((hit) => (
              <SearchHit
                key={hit.item.id}
                title={hit.item.name}
                location={hit.location}
                matchedFields={hit.matchedFields}
                {...(hit.item.quantity > 1
                  ? { detail: `Quantity ${String(hit.item.quantity)}` }
                  : {})}
                onPress={() => {
                  onOpenItem(hit.item.id);
                }}
              />
            ))}
          </View>
        </View>
      )}

      {results.storageUnits.length === 0 ? null : (
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
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.s4 },
  section: { gap: space.s2 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  list: { gap: space.s2 },
});
