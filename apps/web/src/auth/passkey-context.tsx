import { createContext, useContext, type JSX, type ReactNode } from "react";

import { browserPasskeyPlatform, type PasskeyPlatform } from "./passkey-platform.js";

const PasskeyContext = createContext<PasskeyPlatform | null>(null);

export const PasskeyProvider = ({
  platform,
  children,
}: {
  readonly platform: PasskeyPlatform;
  readonly children: ReactNode;
}): JSX.Element => (
  <PasskeyContext.Provider value={platform}>{children}</PasskeyContext.Provider>
);

/**
 * The real browser unless the composition root was handed something else —
 * the same arrangement the camera has, and for the same reason: jsdom has no
 * `navigator.credentials`, and the thing being stood in for is a piece of
 * hardware and a platform dialog rather than this app's own code.
 */
export const defaultPasskeyPlatform = (): PasskeyPlatform => browserPasskeyPlatform;

export const usePasskeyPlatform = (): PasskeyPlatform => {
  const platform = useContext(PasskeyContext);
  if (platform === null) {
    throw new Error("usePasskeyPlatform was called outside of a PasskeyProvider");
  }

  return platform;
};
