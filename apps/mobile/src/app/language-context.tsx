import { translator, type Language, type Translate } from "@ariadna/i18n";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { LanguageStore } from "./language.js";

interface LanguageContextValue {
  readonly language: Language;
  readonly choose: (language: Language) => void;
  readonly t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export interface LanguageProviderProps {
  readonly store: LanguageStore;
  readonly children: ReactNode;
}

/**
 * # The chosen language, and every word that follows from it
 *
 * ## Why this renders nothing until it knows
 *
 * The keystore is asynchronous (see `language.ts`), so there is a moment on
 * every cold start when the language is genuinely unknown. There are two
 * honest things to do with that moment and one dishonest one.
 *
 * The dishonest one is to assume English and correct it when the read lands.
 * That is a flash of the wrong language on every single launch for everybody
 * who chose Spanish — the exact audience the feature is for — and a screen
 * reader would announce the English before being interrupted.
 *
 * So the tree below simply does not exist yet. This costs nothing in practice:
 * the read is issued against the same keystore, at the same moment, as the
 * session read the app already waits for, so the app was going to show its
 * loading state either way. What it buys is that the first words anybody sees
 * are the right ones.
 *
 * The frame around it — the safe-area insets, the status bar, the background
 * colour — is deliberately mounted OUTSIDE this, so what fills that moment is
 * the app's own dark background rather than a white rectangle.
 */
export const LanguageProvider = ({ store, children }: LanguageProviderProps): JSX.Element | null => {
  const [language, setLanguage] = useState<Language | null>(null);

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

  const value = useMemo<LanguageContextValue | null>(
    () =>
      language === null
        ? null
        : {
            language,
            choose: (next) => {
              setLanguage(next);
              void store.save(next);
            },
            t: translator(language),
          },
    [language, store],
  );

  if (value === null) {
    return null;
  }

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

/** For the one control that is ABOUT the language rather than written in it. */
export const useLanguageChoice = (): Pick<LanguageContextValue, "language" | "choose"> =>
  useLanguageContext();
