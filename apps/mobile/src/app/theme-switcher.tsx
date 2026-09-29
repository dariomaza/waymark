import { THEME_CHOICES, type ThemeChoice } from "@waymark/tokens";
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "../ui/atoms/icon.js";
import { themed } from "../ui/styles/theme.js";
import { radius, space, TAP_TARGET, text } from "../ui/styles/tokens.js";
import { useTranslate } from "./language-context.js";
import { useThemeChoice } from "./theme-context.js";

/** Each answer's drawing: the phone's own is both at once. */
const DRAWN: Readonly<Record<ThemeChoice, IconName>> = {
  system: "sunMoon",
  light: "sun",
  dark: "moon",
};

/**
 * # How the app looks: the phone's scheme, the light, or the dark (ADR 25)
 *
 * A setting, not an action, so it is a row of three radios and not a button
 * (ADR 21): one of them is always the answer. The radio role and the selected
 * state are stated, so a screen reader hears the grouping and which one is
 * chosen, the way the browser's real radios give it for free. Each is a word
 * beside a picture, and the whole row shares the width.
 *
 * The browser draws the same three, in the same order, with the same pictures.
 */
export const ThemeSwitcher = (): JSX.Element => {
  const styles = useStyles();
  const { choice, choose } = useThemeChoice();
  const t = useTranslate();

  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t("appearance.label")}>
      {THEME_CHOICES.map((option, index) => {
        const chosen = choice === option;
        const word = t(`appearance.${option}`);

        return (
          <Pressable
            key={option}
            role="radio"
            accessibilityLabel={word}
            accessibilityState={{ selected: chosen, checked: chosen }}
            onPress={() => {
              choose(option);
            }}
            style={[styles.option, index > 0 ? styles.divided : null, chosen ? styles.chosen : null]}
          >
            <Icon
              name={DRAWN[option]}
              size={20}
              color={chosen ? styles.chosenWord.color : styles.word.color}
            />
            <Text style={[styles.word, chosen ? styles.chosenWord : null]}>{word}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    group: {
      flexDirection: "row",
      alignSelf: "stretch",
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radius.s,
      overflow: "hidden",
    },
    // A thumb is about 9mm across: `TAP_TARGET` is the floor, as for a button.
    option: {
      flex: 1,
      flexDirection: "row",
      minHeight: TAP_TARGET,
      minWidth: TAP_TARGET,
      alignItems: "center",
      justifyContent: "center",
      gap: space.s2,
      paddingHorizontal: space.s3,
    },
    divided: { borderLeftWidth: 1, borderLeftColor: colors.line },
    chosen: { backgroundColor: colors.accent },
    word: { color: colors.inkMuted, fontSize: text.s, fontWeight: "600" },
    chosenWord: { color: colors.accentInk },
  }),
);
