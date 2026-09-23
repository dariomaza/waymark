import { translator, type Language, type Translate } from "@waymark/i18n";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { languageStore } from "./language.js";

interface LanguageContextValue {
  readonly language: Language;
  readonly choose: (language: Language) => void;
  readonly t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * # The chosen language, and every word that follows from it
 *
 * Read from the store SYNCHRONOUSLY, in the initial state, rather than in an
 * effect after the first paint. `localStorage` is synchronous, so there is no
 * reason to render English and then correct it — and that correction is
 * exactly what somebody who chose Spanish would see on every single load. The
 * phone cannot do this, because its keystore is asynchronous; the browser can,
 * so it does.
 *
 * The translator is rebuilt only when the language changes, so choosing a
 * language re-renders the tree once and every sentence in it changes at the
 * same moment.
 */
export const LanguageProvider = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const [language, setLanguage] = useState<Language>(() => languageStore.read());

  /**
   * The page's own language, told to the browser.
   *
   * This is not decoration. A screen reader picks its voice and its
   * pronunciation rules from `lang`, and Spanish read aloud by an English
   * synthesiser is harder to follow than either language would be alone —
   * the worst outcome for the person most dependent on the words being right.
   * It also drives hyphenation, quote marks and the offer to translate.
   */
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      choose: (next) => {
        setLanguage(next);
        languageStore.save(next);
      },
      t: translator(language),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

const useLanguageContext = (): LanguageContextValue => {
  const value = useContext(LanguageContext);

  if (value === null) {
    // Not a nicety: a component rendered outside the provider would otherwise
    // fall back to English and look correct in every test that speaks English,
    // which is every test that has not been written to catch this.
    throw new Error("Nothing can be said outside a LanguageProvider");
  }

  return value;
};

/**
 * What a component holds instead of a string.
 *
 * Deliberately the only thing most components need. Which language it is is
 * not their business — they have something to say, and this says it.
 */
export const useTranslate = (): Translate => useLanguageContext().t;

/**
 * Which language is on screen, for the things the dictionary cannot say.
 *
 * A date is the case this exists for. `toLocaleDateString` needs a locale, and
 * putting "3 Apr 2026" into a phrase would mean the dictionary carried a date
 * format — which is a second copy of something the platform already knows how
 * to do in every language there is.
 *
 * It is deliberately NOT a way around `useTranslate`. A component reaching for
 * this to pick between two hardcoded sentences has written a dictionary in an
 * `if`.
 */
export const useLanguage = (): Language => useLanguageContext().language;

/** For the one control that is ABOUT the language rather than written in it. */
export const useLanguageChoice = (): Pick<LanguageContextValue, "language" | "choose"> =>
  useLanguageContext();
