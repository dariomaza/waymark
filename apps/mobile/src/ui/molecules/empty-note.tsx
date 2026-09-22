import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, space, text } from "../styles/tokens.js";

export interface EmptyNoteProps {
  /** The sentence. Reads as a statement about this place, not as an error. */
  readonly children: string;
  /** One line on what this container is FOR, when that is not obvious. */
  readonly explains?: string;
  /** What to do about it, when there is something to do. */
  readonly action?: ReactNode;
}

/**
 * An empty list is a sentence, not a blank area.
 *
 * It used to be one muted line at body size, which undercut that: on an
 * otherwise empty screen the most important thing was also its most recessive
 * element. The web client had the same note inside a dashed box, which was
 * worse again — a dashed border means "drop a file here" or "this part is
 * unfinished" in almost every interface vocabulary, so the one element on
 * screen was reading as a placeholder for itself.
 *
 * No box, on either client. The sentence is title-sized and in normal ink,
 * because on an empty screen it is not a note beside the content: it IS the
 * content. What the place is FOR goes underneath it, quietly, and the thing to
 * do about it goes last.
 */
export const EmptyNote = ({ children, explains, action }: EmptyNoteProps): JSX.Element => (
  <View style={styles.wrap}>
    <Text style={styles.text}>{children}</Text>
    {explains === undefined ? null : <Text style={styles.explains}>{explains}</Text>}
    {action === undefined ? null : action}
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: space.s2, paddingVertical: space.s4, alignItems: "flex-start" },
  text: { color: colors.ink, fontSize: text.l, fontWeight: "600", lineHeight: 26 },
  explains: { color: colors.inkMuted, fontSize: text.m, lineHeight: 22 },
});
