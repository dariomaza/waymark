import type { ThemeChoice } from "@waymark/tokens";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { applyTheme, onDeviceSchemeChange, themeStore } from "./theme.js";

interface ThemeContextValue {
  readonly choice: ThemeChoice;
  readonly choose: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * # The chosen scheme, held for the whole app
 *
 * Read synchronously, so the first render already knows it — and by then
 * `public/theme.js` has already put it on the page, so nothing flips. This
 * provider's job is what happens AFTER: a new choice goes on the page and into
 * storage at once, and while the choice is System the browser's bar follows
 * the device when the device changes its mind.
 */
export const ThemeProvider = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const [choice, setChoice] = useState<ThemeChoice>(() => themeStore.read());

  useEffect(() => {
    applyTheme(choice);

    if (choice !== "system") {
      return undefined;
    }

    return onDeviceSchemeChange(() => {
      applyTheme(choice);
    });
  }, [choice]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      choice,
      choose: (next) => {
        setChoice(next);
        themeStore.save(next);
      },
    }),
    [choice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/** For the one control that is ABOUT how the app looks. */
export const useThemeChoice = (): ThemeContextValue => {
  const value = useContext(ThemeContext);

  if (value === null) {
    throw new Error("Nothing can choose a scheme outside a ThemeProvider");
  }

  return value;
};
