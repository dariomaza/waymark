import { type ItemView, type StorageUnitView } from "@waymark/api-client";
import { kindLabel } from "@waymark/i18n";
import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ItemGrid } from "../../items/views/item-grid.js";
import { Icon } from "../../ui/atoms/icon.js";
import { ScreenTitle } from "../../ui/atoms/screen-title.js";
import { Breadcrumb } from "../../ui/molecules/breadcrumb.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { RowLink } from "../../ui/molecules/row-link.js";
import { colors, space, text } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface UnitDetailProps {
  readonly unit: StorageUnitView;
  /** Root first, ending at this unit. */
  readonly path: readonly StorageUnitView[];
  readonly childUnits: readonly StorageUnitView[];
  readonly items: readonly ItemView[];
  readonly photo: ReactNode;
  readonly actions: ReactNode;
  /**
   * The cover photo for one item, when it has one.
   *
   * Injected rather than fetched here, because a thumbnail is an
   * authenticated request and this file is a view. Returning nothing is what
   * makes a card fall back to its initials.
   */
  readonly itemPhoto?: (item: ItemView) => ReactNode;
  readonly onOpenUnit: (id: string) => void;
  readonly onOpenItem: (id: string) => void;
}

/**
 * Presentational. One unit: where it is, what is inside it, what it says about
 * itself. It takes props and draws; it has never heard of a request.
 *
 * The things inside are a GRID and the units inside stay a LIST. A thing is
 * recognised by its picture — a drawn box is the same drawing for a drill and
 * for a bag of screws — while a box is recognised by its name and the label
 * stuck on it, so squares of photograph would cost three times the height to
 * say less. The icon on those rows is what says which of the two kinds of
 * thing on this screen a row is.
 *
 * Everything above the grid is its header, so the whole screen scrolls as one
 * and the grid is still the virtualised list it needs to be. See `ItemGrid`.
 */
export const UnitDetail = ({
  unit,
  path,
  childUnits,
  items,
  photo,
  actions,
  itemPhoto,
  onOpenUnit,
  onOpenItem,
}: UnitDetailProps): JSX.Element => {
  const t = useTranslate();

  return (
    <ItemGrid
      label={t("units.items")}
      cells={items.map((item) => ({
        key: item.id,
        name: item.name,
        /**
         * The tags. Inside a unit the location is the same string on every
         * card, which is noise rather than an answer.
         */
        secondary: item.tags.join(", "),
        quantity: item.quantity,
        photo: itemPhoto?.(item),
        onPress: () => {
          onOpenItem(item.id);
        },
      }))}
      header={
        <View style={styles.head}>
          <Breadcrumb
            path={path.slice(0, -1)}
            onOpen={(step) => {
              onOpenUnit(step.id);
            }}
          />
          <ScreenTitle>{unit.name}</ScreenTitle>
          <Text style={styles.kind}>{kindLabel(t, unit.kind)}</Text>
          {unit.description === null ? null : (
            <Text style={styles.description}>{unit.description}</Text>
          )}

          {photo}

          <View style={styles.actions}>{actions}</View>

          {childUnits.length === 0 && items.length === 0 ? (
            <EmptyNote explains={t("units.isEmptyExplains")}>
              {t("units.isEmpty")}
            </EmptyNote>
          ) : null}

          {childUnits.length === 0 ? null : (
            <>
              <Text accessibilityRole="header" style={styles.heading}>
                {t("units.unitsInside")}
              </Text>
              <View style={styles.list} accessibilityLabel={t("units.unitsInside")}>
                {childUnits.map((child) => (
                  <RowLink
                    key={child.id}
                    title={child.name}
                    detail={kindLabel(t, child.kind)}
                    leading={<Icon name="box" size={20} color={colors.inkMuted} />}
                    onPress={() => {
                      onOpenUnit(child.id);
                    }}
                  />
                ))}
              </View>
            </>
          )}

          {items.length === 0 ? null : (
            <Text accessibilityRole="header" style={styles.heading}>
              {t("units.items")}
            </Text>
          )}
        </View>
      }
    />
);
};

const styles = StyleSheet.create({
  head: { gap: space.s3 },
  kind: { color: colors.inkMuted, fontSize: text.s },
  description: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700", marginTop: space.s3 },
  list: { gap: space.s2 },
});
