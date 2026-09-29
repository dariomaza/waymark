import type { JSX, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "../atoms/logo.js";
import { space } from "../styles/tokens.js";
import { themed } from "../styles/theme.js";

export interface AppBarProps {
  /** What the header is called for a screen reader: the name the logo draws. */
  readonly title: string;
  readonly actions?: ReactNode;
}

/**
 * The top bar. Presentational to the bone: it is handed a title and some
 * controls and knows nothing about what any of them do.
 *
 * The name is drawn rather than typed: the logo, the word with the pin over
 * its w (ADR 24). It replaced the pair that stood here — the mark, then the
 * word beside it — because the logo already IS both, and the browser's bar
 * draws the same thing from the same numbers. The header carries the name for
 * a screen reader, so the drawing inside it is hidden rather than read twice.
 *
 * It pads itself by the status bar inset rather than sitting inside a
 * `SafeAreaView`, because the screen below it must keep scrolling under the
 * navigation bar at the bottom; only the top edge is this component's problem.
 *
 * The logo takes the mark's own colour, which follows the scheme: lime on the
 * dark, ink on the light, and never lime on white (ADR 24, ADR 25).
 */
export const AppBar = ({ title, actions }: AppBarProps): JSX.Element => {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.s2 }]}>
      <View accessible accessibilityRole="header" accessibilityLabel={title}>
        {/* The mark's own colour: lime on the dark, ink on the light (ADR 24). */}
        <Logo height={24} />
      </View>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.s2,
      paddingHorizontal: space.s4,
      paddingBottom: space.s2,
      backgroundColor: colors.surfaceRaised,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    // Pushed to the far edge, where a thumb reaching across finds them.
    actions: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: space.s2 },
  }),
);
