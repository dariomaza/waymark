import { schemeFor, type ThemeChoice } from "@waymark/tokens";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from "react";

import { SchemeProvider } from "../ui/styles/theme.js";
import type { DeviceScheme } from "./device-scheme.js";
import type { ThemeStore } from "./theme.js";

interface ThemeChoiceValue {
  readonly choice: ThemeChoice;
  readonly choose: (choice: ThemeChoice) => void;
}

const ThemeChoiceContext = createContext<ThemeChoiceValue | null>(null);

export interface ThemeProviderProps {
  readonly store: ThemeStore;
  readonly device: DeviceScheme;
  readonly children: ReactNode;
}

/**
 * # The chosen scheme, and the palette that follows from it
 *
 * It renders nothing until the keystore has answered, for the reason the
 * language provider gives: drawing the device's scheme and then flipping to
 * the stored one a frame later is a flash on every launch for exactly the
 * people who made a choice. The read is issued at the same moment as the
 * session's and the language's, so the app was going to wait for the keystore
 * anyway; until then the launch screen's own dark background shows.
 *
 * While the choice is System the phone's setting is followed live: somebody
 * whose phone goes dark at sunset does not have to reopen the app.
 */
export const ThemeProvider = ({ store, device, children }: ThemeProviderProps): JSX.Element | null => {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  const deviceScheme = useSyncExternalStore(device.subscribe, device.current);

  useEffect(() => {
    let listening = true;

    void store.read().then((stored) => {
      if (listening) {
        setChoice(stored);
      }
    });

    return () => {
      listening = false;
    };
  }, [store]);

  const value = useMemo<ThemeChoiceValue | null>(
    () =>
      choice === null
        ? null
        : {
            choice,
            choose: (next) => {
              setChoice(next);
              void store.save(next);
            },
          },
    [choice, store],
  );

  if (value === null) {
    return null;
  }

  return (
    <ThemeChoiceContext.Provider value={value}>
      <SchemeProvider scheme={schemeFor(value.choice, deviceScheme)}>{children}</SchemeProvider>
    </ThemeChoiceContext.Provider>
  );
};

/** For the one control that is ABOUT how the app looks. */
export const useThemeChoice = (): ThemeChoiceValue => {
  const value = useContext(ThemeChoiceContext);

  if (value === null) {
    throw new Error("Nothing can choose a scheme outside a ThemeProvider");
  }

  return value;
};
