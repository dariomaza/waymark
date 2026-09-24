import type { Printer } from "../units/printer.js";

export interface FakePrinter extends Printer {
  /** Every page handed to the platform, in order. */
  readonly printed: readonly string[];
}

export interface FakePrinterOptions {
  /** A phone with no print service, or somebody who backed out of the dialog. */
  readonly refuses?: Error;
}

/**
 * Stands in for Android's print service.
 *
 * It records the page rather than drawing it, which is the whole of what a test
 * can say about printing: the bytes that reached the platform are the last
 * thing this app is responsible for.
 */
export const fakePrinter = ({ refuses }: FakePrinterOptions = {}): FakePrinter => {
  const printed: string[] = [];

  return {
    printed,
    async print(html) {
      if (refuses !== undefined) {
        return await Promise.reject(refuses);
      }

      printed.push(html);

      return await Promise.resolve();
    },
  };
};
