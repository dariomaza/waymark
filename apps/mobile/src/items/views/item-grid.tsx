import type { JSX, ReactNode } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { space } from "../../ui/styles/tokens.js";
import { ItemCard } from "./item-card.js";

/** One card's worth of what a screen decided to say about a thing. */
export interface ItemCell {
  readonly key: string;
  readonly name: string;
  readonly secondary?: string | undefined;
  readonly quantity?: number | undefined;
  readonly label?: string | undefined;
  readonly photo?: ReactNode;
  readonly onPress: () => void;
  /** Picking mode, and this card's tick. See `ItemCard`. */
  readonly picking?: boolean;
  readonly selected?: boolean;
  readonly onLongPress?: (() => void) | undefined;
}

export interface ItemGridProps {
  /** What this list of things IS, for a screen reader. */
  readonly label: string;
  readonly cells: readonly ItemCell[];
  /** Everything above the grid. It scrolls with it. */
  readonly header?: ReactNode;
  /** Everything below it — the storage units a search also found. */
  readonly footer?: ReactNode;
}

const COLUMNS = 3;

/**
 * # Things, three across
 *
 * Three columns on a phone is the count at which a photograph is still big
 * enough to recognise a drill in and small enough that a boxful is one
 * screenful.
 *
 * ## Why there is no lazy-loading component here
 *
 * The web client grew one: every thumbnail is an authenticated request, so a
 * grid of forty things is forty of them, and the DOM has no way to stop that
 * except to watch the viewport with an `IntersectionObserver` and ask for the
 * bytes a screen before they are needed.
 *
 * This platform already has that, and it is called `FlatList`. A cell outside
 * the window is not mounted, so its `AuthenticatedImage` does not exist and no
 * request is made; scrolling mounts it, which starts the fetch. Hand-rolling
 * viewport arithmetic over a `ScrollView` with `onLayout` and scroll offsets
 * would rebuild — worse, and with a jsdom-shaped fallback bug waiting in it —
 * what virtualisation does natively.
 *
 * `windowSize` is the knob that matters: 3 keeps one screenful mounted either
 * side of the visible one, which is the same "a screen early" the web client
 * spells as a 400px root margin. The default of 21 would mount ten screens in
 * each direction, which for authenticated thumbnails is the very stampede the
 * web client went to the trouble of avoiding.
 *
 * This is why the grid IS the screen's scroller rather than sitting inside
 * one. A virtualised list nested in a `ScrollView` is given infinite height,
 * renders everything, and quietly becomes a plain list again.
 */
export const ItemGrid = ({ label, cells, header, footer }: ItemGridProps): JSX.Element => (
  <FlatList
    style={styles.grid}
    accessibilityLabel={label}
    data={padded(cells)}
    keyExtractor={(cell, index) => cell?.key ?? `gap-${String(index)}`}
    numColumns={COLUMNS}
    columnWrapperStyle={styles.row}
    contentContainerStyle={styles.content}
    initialNumToRender={4}
    windowSize={3}
    {...(header === undefined ? {} : { ListHeaderComponent: <>{header}</> })}
    {...(footer === undefined ? {} : { ListFooterComponent: <>{footer}</> })}
    renderItem={({ item }) => (
      <View style={styles.cell}>{item === null ? null : <ItemCard {...item} />}</View>
    )}
  />
);

/**
 * Empty places where the last row runs out.
 *
 * Every cell is a third of the row, so four things must draw as three and one
 * — not as three and one stretched across the whole width, which is what a
 * flexed last row does and which makes the fourth thing look like a different
 * kind of thing.
 */
const padded = (cells: readonly ItemCell[]): readonly (ItemCell | null)[] => {
  const missing = (COLUMNS - (cells.length % COLUMNS)) % COLUMNS;

  return [...cells, ...(Array(missing).fill(null) as null[])];
};

const styles = StyleSheet.create({
  grid: { flex: 1 },
  content: { gap: space.s3 },
  row: { gap: space.s2 },
  cell: { flex: 1 },
});
