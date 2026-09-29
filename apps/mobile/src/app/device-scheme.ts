import type { Scheme } from "@waymark/tokens";
import { Appearance } from "react-native";

/**
 * # What the phone itself is set to: light, dark, or no opinion
 *
 * A port, like the keystore and the camera: it is the operating system, and a
 * test has to be able to say "the phone is light" and then change its mind.
 * The fake is `testing/fake-device-scheme.ts`.
 *
 * `null` is a real answer — React Native reports no scheme on some devices —
 * and `schemeFor` in `@waymark/tokens` turns it into the dark.
 */
export interface DeviceScheme {
  current(): Scheme | null;
  /** Calls back when the phone's setting changes. Returns the way to stop. */
  subscribe(onChange: () => void): () => void;
}

const known = (value: string | null | undefined): Scheme | null =>
  value === "light" || value === "dark" ? value : null;

/**
 * The real one. `app.json` sets `userInterfaceStyle` to `automatic`, which is
 * what makes Android report the system setting here at all; with `dark` it
 * always answered dark.
 */
export const appearanceDeviceScheme = (): DeviceScheme => ({
  current: () => known(Appearance.getColorScheme()),
  subscribe: (onChange) => {
    const subscription = Appearance.addChangeListener(onChange);

    return () => {
      subscription.remove();
    };
  },
});
