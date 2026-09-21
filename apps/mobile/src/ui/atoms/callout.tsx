import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, space, text } from "../styles/tokens.js";

/**
 * The three things this app has to say, and they are not interchangeable.
 *
 * `blocked` is a refusal about the WORLD — the box still has things in it —
 * and it usually comes with a button that changes the world. `wrong` is a
 * refusal about the REQUEST, and it belongs next to the field that caused it.
 * `note` is neither. ADR 8 draws that line in the API; this is where it
 * reaches a person.
 */
export type CalloutTone = "blocked" | "wrong" | "note";

export interface CalloutProps {
  readonly tone: CalloutTone;
  readonly title?: string | undefined;
  readonly children: ReactNode;
  /** What to do about it. A refusal with no way forward is a dead end. */
  readonly action?: ReactNode;
}

export const Callout = ({ tone, title, children, action }: CalloutProps): JSX.Element => (
  <View
    // A refusal interrupts; a note does not.
    role={tone === "note" ? "status" : "alert"}
    style={[styles.base, styles[tone]]}
  >
    {title === undefined ? null : <Text style={styles.title}>{title}</Text>}
    {typeof children === "string" ? <Text style={styles.text}>{children}</Text> : children}
    {action === undefined ? null : <View style={styles.action}>{action}</View>}
  </View>
);

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.m,
    borderLeftWidth: 4,
    backgroundColor: colors.surfaceRaised,
    padding: space.s4,
    gap: space.s2,
  },
  blocked: { borderLeftColor: colors.warning },
  wrong: { borderLeftColor: colors.danger },
  note: { borderLeftColor: colors.line },
  title: { color: colors.ink, fontSize: text.m, fontWeight: "700" },
  text: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
  action: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
});
