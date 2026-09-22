import type { LinkingOptions, NavigatorScreenParams } from "@react-navigation/native";

/**
 * # What this app can be looking at
 *
 * The same screens the web client routes to, named rather than spelled as
 * paths — with one difference that is the whole reason this app exists.
 *
 * `Scan` is the first tab, not a button behind a menu. The product is a
 * printed QR on a box and a phone pointed at it; every tap between launching
 * the app and the camera being live is a tap taken in a garage, one-handed,
 * holding something.
 */
export interface TabParamList extends Record<string, object | undefined> {
  Scan: undefined;
  Inventory: undefined;
  Search: { readonly within?: string } | undefined;
  Items: undefined;
}

export interface RootStackParamList extends Record<string, object | undefined> {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Unit: { readonly id: string };
  Item: { readonly id: string };
  Label: { readonly id: string };
  /** The address printed on every box: `<public base>/u/<publicId>`. */
  ScannedLabel: { readonly publicId: string };
}

/**
 * The one URL shape this app answers to.
 *
 * Android's stock camera offers to OPEN a URL and merely offers to copy a
 * string, which is why a label encodes one (README). The host is whatever
 * `WAYMARK_PUBLIC_BASE_URL` was when the sticker was printed, so the app
 * claims the PATH and lets the operating system decide which hosts it
 * verifies — a client that only accepted one host would stop reading labels
 * the day that setting moved.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["ariadna://", "https://"],
  config: {
    screens: {
      ScannedLabel: "u/:publicId",
      Unit: "units/:id",
      Item: "items/:id",
    },
  },
};
