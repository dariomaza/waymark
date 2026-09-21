import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { CodeScanner } from "./code-scanner.js";

const ScannerContext = createContext<CodeScanner | null>(null);

export const ScannerProvider = ({
  scanner,
  children,
}: {
  readonly scanner: CodeScanner;
  readonly children: ReactNode;
}): JSX.Element => (
  <ScannerContext.Provider value={scanner}>{children}</ScannerContext.Provider>
);

export const useScanner = (): CodeScanner => {
  const scanner = useContext(ScannerContext);
  if (scanner === null) {
    throw new Error("useScanner was called outside of a ScannerProvider");
  }

  return scanner;
};
