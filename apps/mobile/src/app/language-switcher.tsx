import { LANGUAGE_NAMES, LANGUAGES, type Language } from "@waymark/i18n";
import type { JSX } from "react";

import { Segmented } from "../ui/atoms/segmented.js";
import { SettingRow } from "../ui/molecules/setting-row.js";
import { useLanguageChoice, useTranslate } from "./language-context.js";

/**
 * The one control that is ABOUT the language rather than written in it.
 *
 * Two answers rather than a picker, because there are two options and both
 * fit — an Android picker to choose between two things opens a modal wheel
 * over the whole screen to hide half the answer behind a tap. Drawn by
 * `Segmented`, the same control the appearance uses, as a row of the account
 * screen's preferences.
 *
 * The choice lives in the provider, because it decides every other word on
 * the screen, and the provider waits for the keystore rather than letting the
 * interface change under somebody — see `language-context.tsx`.
 */
export const LanguageSwitcher = (): JSX.Element => {
  const { language, choose } = useLanguageChoice();
  const t = useTranslate();

  return (
    <SettingRow icon="globe" label={t("language.label")}>
      <Segmented<Language>
        label={t("language.label")}
        value={language}
        onChoose={choose}
        options={LANGUAGES.map((code) => ({
          value: code,
          /**
           * The names are NOT translated, and that is the point: a person
           * looking for Spanish in an interface they cannot read is looking
           * for the word "Español". A list of languages written in the
           * language you are trying to leave is a list only its speakers can
           * use.
           */
          name: LANGUAGE_NAMES[code],
          drawn: { letters: code.toUpperCase() },
        }))}
      />
    </SettingRow>
  );
};
