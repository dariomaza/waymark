import type { JSX, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface RowLinkProps {
  readonly title: string;
  /** Where it is, or what it is: one quiet line under the name. */
  readonly detail?: string | undefined;
  readonly onPress: () => void;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}

/** One line of a list, tall enough to hit without looking. */
export const RowLink = ({
  title,
  detail,
  onPress,
  leading,
  trailing,
}: RowLinkProps): JSX.Element => (
  <View style={styles.row}>
    {leading === undefined ? null : <View>{leading}</View>}
    <Pressable
      role="link"
      accessibilityLabel={detail === undefined ? title : `${title}, ${detail}`}
      onPress={onPress}
      style={styles.press}
    >
      <Text style={styles.title}>{title}</Text>
      {detail === undefined ? null : <Text style={styles.detail}>{detail}</Text>}
    </Pressable>
    {trailing === undefined ? null : <View>{trailing}</View>}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s3,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.m,
    paddingHorizontal: space.s3,
  },
  press: { flex: 1, minHeight: TAP_TARGET, justifyContent: "center", paddingVertical: space.s2 },
  title: { color: colors.ink, fontSize: text.m, fontWeight: "600" },
  detail: { color: colors.inkMuted, fontSize: text.s },
});
