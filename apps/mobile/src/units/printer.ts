import * as Print from "expo-print";

/**
 * # The printer, as a port
 *
 * The same arrangement as the camera, the photo library, the keystore and the
 * clipboard, and for the same reason: it is the operating system. Android's
 * print service does not exist under a test runner, and a test that reached for
 * it would be a test of `expo-print`.
 *
 * What crosses this boundary is a string of HTML and nothing else. That keeps
 * the interesting half — WHICH units, and what a label says — on this side of
 * the port, where it can be asserted, and leaves the platform with the one job
 * only it can do.
 */
export interface Printer {
  /** Hands a page to the platform. Rejects if it could not be started. */
  print(html: string): Promise<void>;
}

/**
 * Android's print service, by way of `expo-print`.
 *
 * ADR 21 said printing was a browser errand and that this client needed none of
 * it. `expo-print` matches this app's SDK and has shipped Android printing and
 * PDF generation the whole time, so the claim was never true; the ADR records
 * the reversal.
 *
 * `printAsync` puts up the system print dialog, which is where a person chooses
 * the printer, the paper and how many copies — and where "Save as PDF" lives,
 * so a phone with no printer on the network still gets a file it can send
 * somewhere that has one.
 */
export const expoPrinter = (): Printer => ({
  async print(html) {
    await Print.printAsync({ html });
  },
});
