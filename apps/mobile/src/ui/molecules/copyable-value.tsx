import { useState, type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../atoms/icon.js";
import { useClipboard } from "../clipboard-context.js";
import { colors, radius, space, TAP_TARGET, text } from "../styles/tokens.js";

export interface CopyableValueProps {
  /** The exact string shown, and the exact string handed to the clipboard. */
  readonly value: string;
  /** What the string IS, for somebody who cannot see the block it sits in. */
  readonly valueLabel: string;
  /** The name of the control, which is all an icon-only button has. */
  readonly copyLabel: string;
  /** What the control is called once it has worked. */
  readonly copiedLabel: string;
  /** The sentence shown when the phone would not copy. */
  readonly failedLabel: string;
  /**
   * The two assignments the MCP server reads are two LINES, and a single-line
   * value block would draw them as one — which is a block somebody pastes into
   * an environment file and then has to split by hand.
   */
  readonly multiline?: boolean;
}

/**
 * # A string you are meant to take, and the control that takes it
 *
 * Three things on the account screen are copied — a credential, an address,
 * and the two of them together — and all three need the same three states:
 * untouched, copied, and refused. Written once, they cannot drift apart.
 *
 * ## The control is an icon BESIDE the value, and that is the whole shape
 *
 * It was a full-width button under the value, which is the same mistake the
 * password reveal made before it moved inside the field. So the value and its
 * control are ONE component rather than two things a screen places near each
 * other: a caller cannot separate them, put a paragraph between them, or
 * forget the refusal sentence, and the eye connects the picture to the string
 * without a caption — which is the only reason an icon is allowed to replace
 * a word at all.
 *
 * The drawing is 20pt and its target is 48, because a thumb is about 9mm
 * across and this is used standing up with a box in the other hand. It sits
 * at the TOP of the block rather than centred on it, so a secret that wraps
 * onto four lines does not push the control down the screen.
 *
 * ## What it says, and when
 *
 * The drawing flips to a tick once it has worked, and so does the control's
 * NAME — which is the half that matters, because somebody who cannot see the
 * tick would otherwise be told nothing happened.
 *
 * The refusal keeps its whole sentence. `Clipboard.copy` answers whether it
 * worked rather than throwing, because a refused copy is a normal outcome:
 * the way out on Android is to hold the text down until the system offers its
 * own copy, which is why the value stays on screen and stays selectable.
 */
export const CopyableValue = ({
  value,
  valueLabel,
  copyLabel,
  copiedLabel,
  failedLabel,
  multiline = false,
}: CopyableValueProps): JSX.Element => {
  const clipboard = useClipboard();
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text
          accessibilityLabel={valueLabel}
          selectable
          style={[styles.value, multiline ? styles.multiline : null]}
        >
          {value}
        </Text>
        <Pressable
          role="button"
          /*
           * An icon-only control has no text, so this is the whole of its
           * accessible name — and it is a real name rather than a description
           * of the picture: "Copy the address", not "two sheets of paper".
           */
          accessibilityLabel={copied === true ? copiedLabel : copyLabel}
          onPress={() => {
            void clipboard.copy(value).then(setCopied);
          }}
          style={({ pressed }) => [styles.copy, pressed ? styles.pressed : null]}
        >
          <Icon
            name={copied === true ? "check" : "copy"}
            size={20}
            color={copied === true ? colors.accentText : colors.inkMuted}
          />
        </Pressable>
      </View>
      {copied === false ? <Text style={styles.failed}>{failedLabel}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.s1, alignSelf: "stretch" },
  /*
   * `flex-start` keeps the control at the TOP of the block: a 43-character
   * secret wraps onto four lines on a phone, and a control centred on four
   * lines is one somebody has to go looking for.
   */
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.s2 },
  /**
   * Monospaced and sunken, because everything this holds is a string to be
   * TRANSCRIBED rather than prose to be read. It wraps rather than truncating:
   * an address with its last eight characters off the right-hand edge of a
   * phone is one somebody retypes wrongly.
   */
  value: {
    flex: 1,
    color: colors.ink,
    fontFamily: "monospace",
    fontSize: text.s,
    lineHeight: 20,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.s,
    padding: space.s2,
  },
  multiline: { lineHeight: 22 },
  /** Never smaller than a thumb, and never squeezed by a long value. */
  copy: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.m,
  },
  pressed: { opacity: 0.7 },
  failed: { color: colors.danger, fontSize: text.s, lineHeight: 20 },
});
