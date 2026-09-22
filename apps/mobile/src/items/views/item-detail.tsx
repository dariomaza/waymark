import type { ItemView, StorageUnitView } from "@waymark/api-client";
import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenTitle } from "../../ui/atoms/screen-title.js";
import { Breadcrumb } from "../../ui/molecules/breadcrumb.js";
import { colors, space, text } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface ItemDetailProps {
  readonly item: ItemView;
  /** Root first, ending at the unit that holds it. */
  readonly path: readonly StorageUnitView[];
  readonly photos: ReactNode;
  readonly actions: ReactNode;
  readonly onOpenUnit: (id: string) => void;
}

/** Presentational. One item: what it is, where it is, and its pictures. */
export const ItemDetail = ({
  item,
  path,
  photos,
  actions,
  onOpenUnit,
}: ItemDetailProps): JSX.Element => {
  const t = useTranslate();

  return (
    <View style={styles.wrap}>
      <Breadcrumb
        path={path}
        onOpen={(unit) => {
          onOpenUnit(unit.id);
        }}
      />
      <ScreenTitle>{item.name}</ScreenTitle>
      {item.quantity > 1 ? (
        <Text style={styles.quiet}>Quantity {item.quantity}</Text>
      ) : null}
      {item.description === null ? null : (
        <Text style={styles.description}>{item.description}</Text>
      )}
      {item.tags.length === 0 ? null : (
        <Text style={styles.quiet} accessibilityLabel={t("items.tagsLabel", { tags: item.tags.join(", ") })}>
          {item.tags.join(" · ")}
        </Text>
      )}

      <View style={styles.actions}>{actions}</View>

      {photos}
    </View>
);
};

const styles = StyleSheet.create({
  wrap: { gap: space.s3 },
  quiet: { color: colors.inkMuted, fontSize: text.s },
  description: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
});
