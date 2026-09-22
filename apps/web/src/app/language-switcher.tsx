import { LANGUAGE_NAMES, LANGUAGES } from "@ariadna/i18n";
import type { JSX } from "react";

import { useLanguageChoice, useTranslate } from "./language-context.js";
import "./language-switcher.css";

/**
 * The one control that is ABOUT the language rather than written in it.
 *
 * Radios rather than a `select`, because there are two options and both fit
 * on screen — a dropdown to choose between two things hides half the answer
 * behind a tap. They are real radios rather than styled buttons so a keyboard
 * and a screen reader get the grouping for free.
 *
 * The choice itself now lives in the provider, because it is no longer this
 * component's private state: it decides every other word on the screen.
 */
export const LanguageSwitcher = (): JSX.Element => {
  const { language, choose } = useLanguageChoice();
  const t = useTranslate();

  return (
    <fieldset className="language-switcher">
      <legend className="language-switcher__legend">{t("language.label")}</legend>
      {LANGUAGES.map((code) => (
        <label key={code} className="language-switcher__option">
          <input
            type="radio"
            name="language"
            value={code}
            checked={language === code}
            onChange={() => {
              choose(code);
            }}
          />
          {/**
           * The code is what fits in a bar; the language's own name is what
           * makes it an accessible label somebody can actually act on. "ES"
           * read aloud is two letters.
           *
           * The names are NOT translated, and that is the point: a person
           * looking for Spanish in an interface they cannot read is looking
           * for the word "Español". A list of languages written in the
           * language you are trying to leave is a list only its speakers can
           * use.
           */}
          <span aria-hidden="true">{code.toUpperCase()}</span>
          <span className="language-switcher__name">{LANGUAGE_NAMES[code]}</span>
        </label>
      ))}
    </fieldset>
  );
};
