import type { StorageUnitView } from "@waymark/api-client";
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, space, text } from "../styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface BreadcrumbProps {
  /** Root first, ending at the thing being looked at. */
  readonly path: readonly StorageUnitView[];
  readonly onOpen: (unit: StorageUnitView) => void;
}

/**
 * Where a thing is, one tappable step at a time.
 *
 * The API ships the path as the units themselves precisely so every step can
 * be opened; `location` is the same path already joined, for a list row that
 * is read at a glance.
 */
export const Breadcrumb = ({ path, onOpen }: BreadcrumbProps): JSX.Element => {
  const t = useTranslate();

  return (
    <View style={styles.wrap} accessibilityLabel={t("shell.breadcrumb")}>
      {path.map((unit, index) => (
        <View key={unit.id} style={styles.step}>
          {index === 0 ? null : <Text style={styles.separator}>{"›"}</Text>}
          <Pressable
            role="link"
            accessibilityLabel={t("units.openNamed", { name: unit.name })}
            onPress={() => {
              onOpen(unit);
            }}
          >
            <Text style={styles.name}>{unit.name}</Text>
          </Pressable>
        </View>
      ))}
    </View>
);
};

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  step: { flexDirection: "row", alignItems: "center" },
  separator: { color: colors.inkMuted, paddingHorizontal: space.s1 },
  name: { color: colors.inkMuted, fontSize: text.s, paddingVertical: space.s1 },
});
