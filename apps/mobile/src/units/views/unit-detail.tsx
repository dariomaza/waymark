import { kindLabel, type ItemView, type StorageUnitView } from "@ariadna/api-client";
import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenTitle } from "../../ui/atoms/screen-title.js";
import { Breadcrumb } from "../../ui/molecules/breadcrumb.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { RowLink } from "../../ui/molecules/row-link.js";
import { colors, space, text } from "../../ui/styles/tokens.js";

export interface UnitDetailProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit. */
  readonly path: readonly StorageUnitView[];
  readonly childUnits: readonly StorageUnitView[];
  readonly items: readonly ItemView[];
  readonly photo: ReactNode;
  readonly actions: ReactNode;
  readonly onOpenUnit: (id: string) => void;
  readonly onOpenItem: (id: string) => void;
}

/**
 * Presentational. One unit: where it is, what is inside it, what it says about
 * itself. It takes props and draws; it has never heard of a request.
 */
export const UnitDetail = ({
  unit,
  path,
  childUnits,
  items,
  photo,
  actions,
  onOpenUnit,
  onOpenItem,
}: UnitDetailProps): JSX.Element => (
  <View style={styles.wrap}>
    <Breadcrumb
      path={path.slice(0, -1)}
      onOpen={(step) => {
        onOpenUnit(step.id);
      }}
    />
    <ScreenTitle>{unit.name}</ScreenTitle>
    <Text style={styles.kind}>{kindLabel(unit.kind)}</Text>
    {unit.description === null ? null : (
      <Text style={styles.description}>{unit.description}</Text>
    )}

    {photo}

    <View style={styles.actions}>{actions}</View>

    <Text accessibilityRole="header" style={styles.heading}>
      Units inside
    </Text>
    {childUnits.length === 0 ? (
      <EmptyNote>Nothing is stored inside this one.</EmptyNote>
    ) : (
      <View style={styles.list} accessibilityLabel="Units inside">
        {childUnits.map((child) => (
          <RowLink
            key={child.id}
            title={child.name}
            detail={kindLabel(child.kind)}
            onPress={() => {
              onOpenUnit(child.id);
            }}
          />
        ))}
      </View>
    )}

    <Text accessibilityRole="header" style={styles.heading}>
      Items
    </Text>
    {items.length === 0 ? (
      <EmptyNote>No items in here yet.</EmptyNote>
    ) : (
      <View style={styles.list} accessibilityLabel="Items">
        {items.map((item) => (
          <RowLink
            key={item.id}
            title={item.name}
            {...(item.quantity > 1 ? { detail: `Quantity ${String(item.quantity)}` } : {})}
            onPress={() => {
              onOpenItem(item.id);
            }}
          />
        ))}
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: space.s3 },
  kind: { color: colors.inkMuted, fontSize: text.s },
  description: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700", marginTop: space.s3 },
  list: { gap: space.s2 },
});
