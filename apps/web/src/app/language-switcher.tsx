import { LANGUAGE_NAMES, LANGUAGES, type Language } from "@waymark/i18n";
import { useId, type JSX } from "react";

import { Segmented } from "../ui/atoms/segmented.js";
import { SettingRow } from "../ui/molecules/setting-row.js";
import { useLanguageChoice, useTranslate } from "./language-context.js";

/**
 * The one control that is ABOUT the language rather than written in it.
 *
 * Two radios rather than a `select`, because there are two options and both
 * fit — a dropdown to choose between two things hides half the answer behind a
 * tap. Drawn by `Segmented`, the same control the appearance uses, as a row of
 * the account screen's preferences.
 *
 * The choice itself lives in the provider, because it is not this component's
 * private state: it decides every other word on the screen.
 */
export const LanguageSwitcher = (): JSX.Element => {
  const { language, choose } = useLanguageChoice();
  const t = useTranslate();
  const labelId = useId();

  return (
    <SettingRow icon="globe" label={t("language.label")} labelId={labelId}>
      <Segmented<Language>
        group="language"
        labelledBy={labelId}
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
