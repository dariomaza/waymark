import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, space, text } from "../styles/tokens.js";

/** Nothing here, said in a sentence rather than with an empty list. */
export const EmptyNote = ({
  children,
  action,
}: {
  readonly children: string;
  readonly action?: ReactNode;
}): JSX.Element => (
  <View style={styles.wrap}>
    <Text style={styles.text}>{children}</Text>
    {action === undefined ? null : action}
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: space.s3, paddingVertical: space.s4, alignItems: "flex-start" },
  text: { color: colors.inkMuted, fontSize: text.m, lineHeight: 22 },
});
