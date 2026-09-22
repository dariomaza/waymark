import { LANGUAGE_NAMES, LANGUAGES } from "@ariadna/i18n";
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../ui/styles/tokens.js";
import { useLanguageChoice, useTranslate } from "./language-context.js";

/**
 * The one control that is ABOUT the language rather than written in it.
 *
 * Two buttons rather than a picker, because there are two options and both fit
 * in the bar — an Android picker to choose between two things opens a modal
 * wheel over the whole screen to hide half the answer behind a tap. They carry
 * the radio role so a screen reader gets the grouping and says which one is
 * chosen, the way the web client's real `<input type="radio">` does for free.
 *
 * The choice itself now lives in the provider, because it is no longer this
 * component's private state: it decides every other word on the screen. And
 * it no longer opens on a default and corrects itself, because the provider
 * waits for the keystore rather than letting the interface change under
 * somebody — see `language-context.tsx`.
 */
export const LanguageSwitcher = (): JSX.Element => {
  const { language, choose } = useLanguageChoice();
  const t = useTranslate();

  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t("language.label")}>
      {LANGUAGES.map((code) => (
        <Pressable
          key={code}
          role="radio"
          /**
           * The code is what fits in a bar; the language's own name is what
           * makes it a label somebody can act on. "ES" read aloud is two
           * letters.
           *
           * The names are NOT translated, and that is the point: a person
           * looking for Spanish in an interface they cannot read is looking
           * for the word "Español". A list of languages written in the
           * language you are trying to leave is a list only its speakers can
           * use.
           */
          accessibilityLabel={LANGUAGE_NAMES[code]}
          accessibilityState={{ selected: language === code, checked: language === code }}
          onPress={() => {
            choose(code);
          }}
          style={[styles.option, language === code ? styles.chosen : null]}
        >
          <Text style={[styles.code, language === code ? styles.chosenCode : null]}>
            {code.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.s,
    overflow: "hidden",
  },
  // Tall enough to hit without looking, like everything else in this app: a
  // bar control is still tapped one-handed, standing up (see `TAP_TARGET`).
  option: {
    minHeight: TAP_TARGET,
    minWidth: 40,
    paddingHorizontal: space.s2,
    justifyContent: "center",
  },
  chosen: { backgroundColor: colors.accent },
  code: { color: colors.inkMuted, fontSize: text.s, fontWeight: "700", textAlign: "center" },
  chosenCode: { color: colors.accentInk },
});
