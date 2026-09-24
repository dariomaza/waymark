import { useEffect, useRef, useState, type JSX } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";

import { colors, space, text } from "../styles/tokens.js";

/** How long one half of the pulse takes. The browser's keyframes say 1s round. */
const HALF_A_PULSE = 500;

const DIM = 0.3;

/**
 * # A mark that says what it is waiting for
 *
 * "Loading" alone tells somebody standing in a garage nothing; "Finding that
 * box" tells them whether to keep waiting.
 *
 * This was a centred `ActivityIndicator`, and the browser drew a pulsing lime
 * dot in a left-aligned row. A wait is on every screen in this product and is
 * usually the first thing anybody sees, so the two clients disagreeing about
 * it meant every screen opened differently.
 *
 * The dot wins, for the reason ADR 20 kept `waypoints` hand-drawn rather than
 * taking lucide's: a platform spinner is the PLATFORM's vocabulary, and a
 * thing on every screen of a product is the product's. It is also the one of
 * the two shapes both platforms can draw identically.
 *
 * Left aligned rather than centred, on both clients, because a wait sits where
 * the content is about to appear and then nothing jumps when it arrives.
 *
 * ## Reduced motion
 *
 * The browser has had a `prefers-reduced-motion` kill switch since it was
 * written. This client had nothing to switch off, having no motion of its own
 * — the platform spinner was the platform's business. Now that the pulse is
 * ours, so is the question, and somebody who has asked their phone for less
 * movement has asked this too: the dot goes still and stays lit, rather than
 * disappearing, because it is still saying that something is happening.
 */
export const Loading = ({ label }: { readonly label: string }): JSX.Element => {
  const opacity = useRef(new Animated.Value(DIM)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let listening = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (listening) {
        setStill(reduced);
      }
    });

    return () => {
      listening = false;
    };
  }, []);

  useEffect(() => {
    if (still) {
      opacity.setValue(1);

      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: HALF_A_PULSE,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: DIM,
          duration: HALF_A_PULSE,
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();

    // A loop left running after the screen has gone is a timer nobody owns.
    return () => {
      pulse.stop();
    };
  }, [opacity, still]);

  return (
    <View
      /*
        One node, so a screen reader announces "Finding that box, progress bar"
        rather than walking a container and a word that mean the same thing.
      */
      accessible
      accessibilityLabel={label}
      role="progressbar"
      style={styles.wrap}
    >
      {/*
        Hidden from assistive technology: the row already carries the label,
        and a dot has nothing of its own to say.
      */}
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.dot, { opacity }]}
      />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    paddingVertical: space.s4,
  },
  /** The browser's 10px dot, at the browser's size, in the browser's lime. */
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  label: { color: colors.inkMuted, fontSize: text.s },
});
