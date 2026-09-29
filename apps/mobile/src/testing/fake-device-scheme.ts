import type { Scheme } from "@waymark/tokens";

import type { DeviceScheme } from "../app/device-scheme.js";

/** A phone whose system scheme a test sets, and can change mid-test. */
export const fakeDeviceScheme = (
  initial: Scheme | null = "dark",
): DeviceScheme & { set(to: Scheme | null): void } => {
  let scheme = initial;
  const listeners = new Set<() => void>();

  return {
    current: () => scheme,
    subscribe: (onChange) => {
      listeners.add(onChange);

      return () => {
        listeners.delete(onChange);
      };
    },
    set: (to) => {
      scheme = to;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};
