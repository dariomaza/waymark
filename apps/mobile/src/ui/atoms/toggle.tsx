import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "./icon.js";
import { radius, space, TAP_TARGET, text } from "../styles/tokens.js";
import { themed, useColors } from "../styles/theme.js";

export interface ToggleProps {
  /** What the setting IS, read and heard. The whole accessible name. */
  readonly label: string;
  /** The sentence under it, when the setting needs one. */
  readonly explains?: string | undefined;
  /** A picture before the words, as every row of a settings card has. */
  readonly icon?: IconName | undefined;
  readonly checked: boolean;
  readonly disabled?: boolean;
  /**
   * Pressed, not "changed".
   *
   * A toggle in this app does not necessarily flip on the touch — the one it
   * was built for asks a question first — so the callback says what happened
   * rather than promising what the control will look like afterwards. The
   * answer to "is it on" comes back through `checked`, from whoever actually
   * knows.
   */
  readonly onPress: () => void;
}

/**
 * # A setting with two states, drawn as one row you can hit
 *
 * The whole ROW is the control, not the little track at the end of it. A
 * switch drawn at its natural size is about 30pt tall and roughly a thumb's
 * width from the edge of the screen — which on a phone held one-handed on a
 * step ladder is a target you miss. So the row carries the minimum tap target
 * and the track is only the picture of the state.
 *
 * ## The track and the thumb are Views, not React Native's `Switch`
 *
 * `Switch` would draw a platform control and announce itself as a second
 * switch inside this one, so a screen reader would meet two controls for one
 * setting and a test would have to say which. Drawing the state is four lines
 * of styling and this app already draws its own radio rows for the same kind
 * of reason (see `OptionList`): the platform's version of the control hides
 * or truncates the thing the control exists to show.
 *
 * It is hidden from assistive technology for the same reason a `Button`'s
 * icon is — the row already says the name and the state in words, and
 * announcing the picture too says it twice.
 */
export const Toggle = ({
  label,
  explains,
  icon,
  checked,
  disabled = false,
  onPress,
}: ToggleProps): JSX.Element => {
  const styles = useStyles();
  const colors = useColors();

  return (
    <Pressable
      role="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      {icon === undefined ? null : <Icon name={icon} size={20} color={colors.inkMuted} />}
      <View style={styles.words}>
        <Text style={styles.label}>{label}</Text>
        {explains === undefined ? null : <Text style={styles.explains}>{explains}</Text>}
      </View>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.track, checked ? styles.trackOn : null]}
      >
        <View style={[styles.thumb, checked ? styles.thumbOn : null]} />
      </View>
    </Pressable>
  );
};

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const THUMB = 22;

const useStyles = themed((colors) =>
  StyleSheet.create({
    row: {
      minHeight: TAP_TARGET,
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.s3,
      paddingVertical: space.s2,
      // The inset every row of a settings card has, so its words line up.
      paddingLeft: space.s4,
      paddingRight: space.s3,
    },
    pressed: { opacity: 0.7 },
    // The words take whatever is left, so a long explanation wraps rather than
    // pushing the track off the side of a phone.
    words: { flex: 1, gap: space.s1 },
    label: { color: colors.ink, fontSize: text.m, fontWeight: "600" },
    explains: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSunken,
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    trackOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      backgroundColor: colors.inkMuted,
      alignSelf: "flex-start",
    },
    thumbOn: { backgroundColor: colors.accentInk, alignSelf: "flex-end" },
  }),
);
