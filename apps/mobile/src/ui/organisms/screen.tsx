import type { JSX, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, space } from "../styles/tokens.js";

/**
 * The frame every screen sits in: the dark surface, the gutter, the status
 * bar's height, and a scroll view when there is more than fits.
 *
 * # Why the status bar is this component's problem
 *
 * Most of the app never notices it. Every signed-in screen has `AppBar` above
 * it, which pads ITSELF by the top inset — so the screen underneath starts
 * where the bar ends and has nothing to work out.
 *
 * The screens outside the navigator have no bar: signing in, and the two
 * loading states around it. They started at pixel zero, which on a phone is
 * underneath the clock and the battery, and the first APK shipped with "Sign
 * in to Waymark" written across the carrier name.
 *
 * So the frame keeps that height rather than each screen remembering to — a
 * default that is right for a screen nobody has thought about yet, which is
 * the opposite of what an opt-in prop would have given. What makes it safe
 * inside the navigator is that `app.tsx` hands that subtree a top inset of
 * ZERO: the bar up there has already spent it, and says so, so the sum below
 * is `0 + gutter` and nothing moved.
 *
 * Only the top edge. The bottom belongs to whatever is down there — the tab
 * bar inside the navigator, nothing at all outside it — and claiming it here
 * would lift every list off the gesture bar by a bar's height.
 *
 * The inset sits on the frame and the gutter stays in the body, which is also
 * why on a scrolling screen the inset does not scroll: the content slides
 * under nothing, because there is nothing above it to slide under.
 */
export const Screen = ({
  children,
  scroll = true,
}: {
  readonly children: ReactNode;
  readonly scroll?: boolean;
}): JSX.Element => {
  const insets = useSafeAreaInsets();
  // The one thing in this file a test can ask for. A frame has no role, no
  // name and no words of its own — it is a rectangle — so there is nothing
  // else to find it by, and what is being asserted is exactly that it starts
  // below the status bar.
  const frame = { testID: "screen", style: [styles.surface, { paddingTop: insets.top }] };

  return scroll ? (
    <ScrollView {...frame} contentContainerStyle={styles.body}>
      {children}
    </ScrollView>
  ) : (
    <View {...frame}>
      <View style={[styles.body, styles.fill]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.surface },
  body: { padding: space.s4, gap: space.s4 },
  /**
   * Only on the branch that does not scroll, where the body is a view of its
   * own and has to hand the rest of the height to whatever list is inside it.
   *
   * Deliberately not part of `body`: on the other branch `body` is a
   * `ScrollView`'s content container, and a flex of one there pins the content
   * to the viewport and stops it scrolling at all.
   */
  fill: { flex: 1 },
});
