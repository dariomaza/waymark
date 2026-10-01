import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "../atoms/icon.js";
import { space, text } from "../styles/tokens.js";
import { themed, useColors } from "../styles/theme.js";

export interface SettingRowProps {
  readonly icon: IconName;
  /** The setting's name, drawn beside its control. */
  readonly label: string;
  /** The control. */
  readonly children: ReactNode;
}

/**
 * # One setting: its picture and name on the left, its control on the right
 *
 * The row a settings screen is made of, and the browser's
 * `ui/molecules/setting-row.tsx`. On a phone too narrow for both, the control
 * drops under the name rather than running off the edge.
 */
export const SettingRow = ({ icon, label, children }: SettingRowProps): JSX.Element => {
  const styles = useStyles();
  const colors = useColors();

  return (
    <View style={styles.row}>
      <View style={styles.name}>
        <Icon name={icon} size={20} color={colors.inkMuted} />
        <Text style={styles.label}>{label}</Text>
      </View>
      {children}
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      rowGap: space.s2,
      columnGap: space.s3,
      minHeight: 56,
      paddingVertical: space.s1,
      paddingLeft: space.s4,
      paddingRight: space.s2,
    },
    name: { flexDirection: "row", alignItems: "center", gap: space.s3, flexShrink: 1 },
    label: { color: colors.ink, fontSize: text.m, fontWeight: "600", flexShrink: 1 },
  }),
);
