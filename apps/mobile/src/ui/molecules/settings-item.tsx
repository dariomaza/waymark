import type { JSX, ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "../atoms/icon.js";
import { space } from "../styles/tokens.js";
import { useColors } from "../styles/theme.js";

export interface SettingsItemProps {
  readonly icon: IconName;
  /** What the row is: a name and its one line of facts. */
  readonly children: ReactNode;
  /** The row's icons, at its end. */
  readonly actions?: ReactNode;
  /** A question the row asks before acting, across the whole width under it. */
  readonly below?: ReactNode;
}

/**
 * # One row of a list inside a settings card
 *
 * A picture, what the row is, and its icons at the end — the browser's
 * `.settings-item`. When the row asks to be confirmed, the question takes the
 * whole width under it rather than squeezing beside the name.
 */
export const SettingsItem = ({ icon, children, actions, below }: SettingsItemProps): JSX.Element => {
  const colors = useColors();

  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Icon name={icon} size={20} color={colors.inkMuted} />
        <View style={styles.text}>{children}</View>
        {actions === undefined ? null : <View style={styles.actions}>{actions}</View>}
      </View>
      {below}
    </View>
  );
};

const styles = StyleSheet.create({
  item: {
    gap: space.s2,
    minHeight: 56,
    justifyContent: "center",
    paddingVertical: space.s1,
    paddingLeft: space.s4,
    paddingRight: space.s2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: "row" },
});
