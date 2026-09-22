import { useEffect, useState, type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../ui/styles/tokens.js";
import { LANGUAGE_NAMES, LANGUAGES, type Language, type LanguageStore } from "./language.js";

export interface LanguageSwitcherProps {
  readonly store: LanguageStore;
}

/**
 * Container and view in one small piece: it owns the choice, and the choice
 * is the only state there is.
 *
 * Two buttons rather than a picker, because there are two options and both fit
 * in the bar — an Android picker to choose between two things opens a modal
 * wheel over the whole screen to hide half the answer behind a tap. They carry
 * the radio role so a screen reader gets the grouping and says which one is
 * chosen, the way the web client's real `<input type="radio">` does for free.
 *
 * The stored choice arrives asynchronously (see `language.ts`), so this opens
 * on the default and corrects itself. Nothing is translated yet, so a person
 * sees the control settle rather than the interface change under them.
 */
export const LanguageSwitcher = ({ store }: LanguageSwitcherProps): JSX.Element => {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    let listening = true;

    void store.read().then((stored) => {
      if (listening) {
        setLanguage(stored);
      }
    });

    return () => {
      listening = false;
    };
  }, [store]);

  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Language">
      {LANGUAGES.map((code) => (
        <Pressable
          key={code}
          role="radio"
          /**
           * The code is what fits in a bar; the language's own name is what
           * makes it a label somebody can act on. "ES" read aloud is two
           * letters.
           */
          accessibilityLabel={LANGUAGE_NAMES[code]}
          accessibilityState={{ selected: language === code, checked: language === code }}
          onPress={() => {
            setLanguage(code);
            void store.save(code);
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
