import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { Clipboard } from "./clipboard.js";

const ClipboardContext = createContext<Clipboard | null>(null);

export const ClipboardProvider = ({
  clipboard,
  children,
}: {
  readonly clipboard: Clipboard;
  readonly children: ReactNode;
}): JSX.Element => (
  <ClipboardContext.Provider value={clipboard}>{children}</ClipboardContext.Provider>
);

export const useClipboard = (): Clipboard => {
  const clipboard = useContext(ClipboardContext);
  if (clipboard === null) {
    throw new Error("useClipboard was called outside of a ClipboardProvider");
  }

  return clipboard;
};
