import { useState, type JSX } from "react";

import { LANGUAGE_NAMES, LANGUAGES, languageStore, type Language } from "./language.js";
import "./language-switcher.css";

/**
 * Container and view in one small piece: it owns the choice, and the choice
 * is the only state there is.
 *
 * Radios rather than a `select`, because there are two options and both fit
 * on screen — a dropdown to choose between two things hides half the answer
 * behind a tap. They are real radios rather than styled buttons so a keyboard
 * and a screen reader get the grouping for free.
 */
export const LanguageSwitcher = (): JSX.Element => {
  const [language, setLanguage] = useState<Language>(() => languageStore.read());

  const choose = (next: Language): void => {
    setLanguage(next);
    languageStore.save(next);
  };

  return (
    <fieldset className="language-switcher">
      <legend className="language-switcher__legend">Language</legend>
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
           */}
          <span aria-hidden="true">{code.toUpperCase()}</span>
          <span className="language-switcher__name">{LANGUAGE_NAMES[code]}</span>
        </label>
      ))}
    </fieldset>
  );
};
