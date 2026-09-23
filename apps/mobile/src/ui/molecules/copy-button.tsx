import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, type ButtonTone } from "../atoms/button.js";
import { useClipboard } from "../clipboard-context.js";
import { colors, space, text } from "../styles/tokens.js";

export interface CopyButtonProps {
  /** The exact string handed to the clipboard. Nothing is trimmed or added. */
  readonly value: string;
  readonly label: string;
  /** What the button says once it has worked. */
  readonly copiedLabel: string;
  /** The sentence shown when the phone would not copy. */
  readonly failedLabel: string;
  readonly tone?: ButtonTone;
}

/**
 * # Put this string on the clipboard, and say so
 *
 * Three things on the account screen are copied — a credential, an address,
 * and the two of them together — and all three need the same three states:
 * untouched, copied, and refused. Written once, they cannot drift apart.
 *
 * It takes its words as props rather than translating anything itself, so it
 * stays a piece of the visual vocabulary rather than a piece of the tokens
 * feature. What it knows is the clipboard; what it says is somebody else's.
 */
export const CopyButton = ({
  value,
  label,
  copiedLabel,
  failedLabel,
  tone = "secondary",
}: CopyButtonProps): JSX.Element => {
  const clipboard = useClipboard();
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    <View style={styles.wrap}>
      <Button
        tone={tone}
        label={copied === true ? copiedLabel : label}
        onPress={() => {
          void clipboard.copy(value).then(setCopied);
        }}
      >
        {copied === true ? copiedLabel : label}
      </Button>
      {copied === false ? <Text style={styles.failed}>{failedLabel}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.s1, alignItems: "flex-start" },
  failed: { color: colors.danger, fontSize: text.s, lineHeight: 20 },
});
