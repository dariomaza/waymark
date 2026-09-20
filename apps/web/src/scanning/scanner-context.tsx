import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { QrScanner } from "./qr-scanner.js";
import { createZxingScanner } from "./zxing-scanner.js";

const ScannerContext = createContext<QrScanner | null>(null);

export const ScannerProvider = ({
  scanner,
  children,
}: {
  readonly scanner: QrScanner;
  readonly children: ReactNode;
}): JSX.Element => (
  <ScannerContext.Provider value={scanner}>{children}</ScannerContext.Provider>
);

/** The real camera unless the composition root was given another one. */
export const defaultScanner = createZxingScanner;

export const useScanner = (): QrScanner => {
  const scanner = useContext(ScannerContext);
  if (scanner === null) {
    throw new Error("useScanner was called outside of a ScannerProvider");
  }

  return scanner;
};
