import { PIN_DROP, SYMBOL, WAIT_MARK_HEIGHT, type Shape } from "@waymark/tokens";
import { useEffect, useRef, useState, type JSX } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Path, Svg } from "react-native-svg";

import { space, text } from "../styles/tokens.js";
import { themed, useColors } from "../styles/theme.js";

const WIDTH = (WAIT_MARK_HEIGHT * SYMBOL.width) / SYMBOL.height;

/** From the symbol's units to points, for the pin's offset. */
const SCALE = WAIT_MARK_HEIGHT / SYMBOL.height;

const [FIRST] = PIN_DROP.steps;

/**
 * The browser's keyframes, as an `Animated` sequence: one timing per stretch,
 * each as long as its share of the loop and eased by the curve its starting
 * step names. A stretch that starts and ends at rest is the pause.
 */
const dropOf = (offset: Animated.Value): Animated.CompositeAnimation =>
  Animated.loop(
    Animated.sequence(
      PIN_DROP.steps.slice(1).map((step, index) => {
        const from = PIN_DROP.steps[index] ?? step;

        return Animated.timing(offset, {
          toValue: step.y,
          duration: (step.at - from.at) * PIN_DROP.durationMs,
          easing: Easing.bezier(...from.ease),
          useNativeDriver: true,
        });
      }),
    ),
  );

const outlines = (shapes: readonly Shape[]): JSX.Element[] =>
  shapes.map((shape) => (
    <Path
      key={shape.d}
      d={shape.d}
      {...(shape.evenOdd === true ? { fillRule: "evenodd" as const } : {})}
    />
  ));

/**
 * # A wait that is the mark finding its place
 *
 * "Loading" alone tells somebody standing in a garage nothing; "Finding that
 * box" tells them whether to keep waiting. Beside the words, the owner asked
 * for the logo: it is what the logo was made for. So the w stays put and the
 * pin drops onto it, settles, rests and lifts, on the clock `PIN_DROP` in
 * `@waymark/tokens` — the steps the browser runs as keyframes.
 *
 * Two drawings of the same box, one over the other: the w, still, and the pin
 * in an `Animated.View` above it, because a transform on a view is what the
 * native driver can move without a round trip through JavaScript on every
 * frame. Both are the logo's own outlines (`SYMBOL`), in the mark's colour:
 * lime on the dark, ink on the light (ADR 24).
 *
 * ## Reduced motion
 *
 * Somebody who has asked their phone for less movement has asked this too:
 * the pin rests in its place, which is the mark as it is drawn everywhere
 * else. The question is answered before anything moves, so the pin never
 * starts dropping only to stop.
 */
export const Loading = ({ label }: { readonly label: string }): JSX.Element => {
  const styles = useStyles();
  const colors = useColors();
  const offset = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState<boolean | null>(null);

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
    if (still !== false) {
      offset.setValue(0);

      return;
    }

    offset.setValue(FIRST?.y ?? 0);
    const drop = dropOf(offset);
    drop.start();

    // A loop left running after the screen has gone is a timer nobody owns.
    return () => {
      drop.stop();
    };
  }, [offset, still]);

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
        and a drawing has nothing of its own to say.
      */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.mark}
      >
        <Svg width={WIDTH} height={WAIT_MARK_HEIGHT} viewBox={SYMBOL.viewBox} fill={colors.mark}>
          {outlines(SYMBOL.letters)}
        </Svg>
        <Animated.View
          style={[styles.pin, { transform: [{ translateY: Animated.multiply(offset, SCALE) }] }]}
        >
          <Svg width={WIDTH} height={WAIT_MARK_HEIGHT} viewBox={SYMBOL.viewBox} fill={colors.mark}>
            {outlines(SYMBOL.pin)}
          </Svg>
        </Animated.View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.s2,
      paddingVertical: space.s4,
    },
    /** The browser's size; the pin lifts above it into the row's padding. */
    mark: { width: WIDTH, height: WAIT_MARK_HEIGHT },
    pin: { position: "absolute", top: 0, left: 0 },
    label: { color: colors.inkMuted, fontSize: text.s },
  }),
);
