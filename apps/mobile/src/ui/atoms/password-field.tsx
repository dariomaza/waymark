import { useState, type JSX } from "react";
import { Pressable, StyleSheet } from "react-native";

import { useTranslate } from "../../app/language-context.js";
import { colors, radius, TAP_TARGET } from "../styles/tokens.js";
import { Icon } from "./icon.js";
import { TextField } from "./text-field.js";

export interface PasswordFieldProps {
  /** What a screen reader says, and what a test asks for. */
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly onSubmitEditing?: (() => void) | undefined;
}

/**
 * # A password, and a way to look at it
 *
 * A mask with no way past it is not security, it is a guess. The password is
 * typed one-handed, standing up, on a phone keyboard, and a mistyped one comes
 * back as "that username or password is wrong" with no way to find out which
 * character went astray — so people retype the whole thing, get it wrong
 * again, and eventually choose a shorter password. The mask stays on by
 * default and comes off on request, which is the trade everybody else made
 * years ago for the same reason.
 *
 * ## Why the control is a switch
 *
 * The one thing somebody needs before pressing it is which way it is set NOW.
 * A button called "Show password" says the same five syllables whether the
 * password is on screen or not; it describes what pressing might do and
 * withholds what is true. A switch carries its state, so a screen reader
 * announces "Show password, on" on landing, without anybody having to press it
 * to find out.
 *
 * The eye drawn on it still flips between open and struck through, because
 * that is an affordance for eyes, and eyes can already see whether the
 * password is legible.
 *
 * ## Why it sits INSIDE the field
 *
 * It used to sit underneath, on the argument that an inset control shrinks
 * below this app's 48pt minimum. That objection does not survive the numbers:
 * the input is already TAP_TARGET tall, so a TAP_TARGET square fits inside its
 * own border exactly, and the input reserves the space with padding rather
 * than letting the eye float over the text. Outside the field it read as a
 * third action competing with signing in — which is what it looked like on a
 * real phone.
 *
 * ## What the keyboard is told, and why it is four things
 *
 * Android will autocorrect, capitalise, spell-check and offer suggestions for
 * anything it believes is prose, and each of those is a separate prop. The
 * last one is the one that leaks: a password the keyboard learns is a password
 * sitting in the IME's dictionary, outside the keystore this app went to some
 * trouble to put it in.
 *
 * `secureTextEntry` suppresses the suggestion strip on its own — which is
 * exactly why unmasking is the dangerous moment. The field becomes an ordinary
 * text input and the suggestions come back. `visible-password` is Android's
 * own input type for "a password somebody is looking at": readable characters,
 * no suggestions, no learning. It is set ONLY while unmasked, because React
 * Native draws the text in the clear when it is combined with
 * `secureTextEntry`.
 */
export const PasswordField = ({
  label,
  value,
  onChangeText,
  onSubmitEditing,
}: PasswordFieldProps): JSX.Element => {
  const t = useTranslate();
  const [shown, setShown] = useState(false);

  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!shown}
      // Autofill still applies: this is about the suggestion strip and the
      // keyboard's own learning, not about a password manager.
      autoComplete="current-password"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      keyboardType={shown ? "visible-password" : "default"}
      returnKeyType="go"
      {...(onSubmitEditing === undefined ? {} : { onSubmitEditing })}
      trailing={
        <Pressable
          role="switch"
          accessibilityLabel={t("login.showPassword")}
          accessibilityState={{ checked: shown }}
          onPress={() => {
            setShown((was) => !was);
          }}
          style={({ pressed }) => [styles.reveal, pressed ? styles.pressed : null]}
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={20} color={colors.inkMuted} />
        </Pressable>
      }
    />
  );
};

const styles = StyleSheet.create({
  reveal: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.s,
  },
  pressed: { opacity: 0.7 },
});
