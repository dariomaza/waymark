import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { Printer } from "./printer.js";

/**
 * The printer this phone has, handed down from the composition root.
 *
 * The same shape as every other port in this app: the root builds the real one,
 * a test hands in one it can read. Nothing in a screen imports `expo-print`.
 */
const PrinterContext = createContext<Printer | null>(null);

export interface PrinterProviderProps {
  readonly printer: Printer;
  readonly children: ReactNode;
}

export const PrinterProvider = ({ printer, children }: PrinterProviderProps): JSX.Element => (
  <PrinterContext.Provider value={printer}>{children}</PrinterContext.Provider>
);

export const usePrinter = (): Printer => {
  const printer = useContext(PrinterContext);
  if (printer === null) {
    throw new Error("usePrinter needs a PrinterProvider above it");
  }

  return printer;
};
