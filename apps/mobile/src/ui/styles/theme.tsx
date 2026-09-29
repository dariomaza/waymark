import { DARK, PALETTES, type Palette, type Scheme } from "@waymark/tokens";
import { createContext, useContext, useMemo, type JSX, type ReactNode } from "react";

/**
 * # One source for the colours on the screen right now (ADR 25)
 *
 * This client was dark only, so every stylesheet in it could be written at
 * import time against one fixed palette. With two schemes the colours are a
 * fact about the moment rather than about the module, so they come from here:
 * `useColors()` for a colour used while drawing, and `themed()` for a
 * stylesheet, which is built once per scheme and then reused.
 *
 * Outside any provider — a single atom rendered on its own in a test — the
 * answer is the dark scheme, which is what a device with no opinion gets.
 */
interface ActiveScheme {
  readonly scheme: Scheme;
  readonly colors: Palette;
}

const SchemeContext = createContext<ActiveScheme>({ scheme: "dark", colors: DARK });

export const SchemeProvider = ({
  scheme,
  children,
}: {
  readonly scheme: Scheme;
  readonly children: ReactNode;
}): JSX.Element => {
  const value = useMemo(() => ({ scheme, colors: PALETTES[scheme] }), [scheme]);

  return <SchemeContext.Provider value={value}>{children}</SchemeContext.Provider>;
};

/** Which scheme is painted: for the status bar, and for the navigator's own theme. */
export const useScheme = (): Scheme => useContext(SchemeContext).scheme;

/** The palette of the scheme painted right now. */
export const useColors = (): Palette => useContext(SchemeContext).colors;

/**
 * A stylesheet that follows the scheme.
 *
 *     const useStyles = themed((colors) => StyleSheet.create({ ... }));
 *     // in the component:
 *     const styles = useStyles();
 *
 * `make` runs at most once per palette, so switching back and forth builds
 * nothing new, and a component re-rendering for any other reason gets the
 * very same objects it had.
 */
export const themed = <T,>(make: (colors: Palette) => T): (() => T) => {
  const made = new Map<Palette, T>();

  return (): T => {
    const colors = useColors();
    const known = made.get(colors);
    if (known !== undefined) {
      return known;
    }

    const built = make(colors);
    made.set(colors, built);

    return built;
  };
};
