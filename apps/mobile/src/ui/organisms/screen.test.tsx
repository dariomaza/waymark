import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Screen } from "./screen.js";

/**
 * A tall phone with a notch and a gesture bar, so the numbers below are
 * distinguishable from every other spacing in the app.
 */
const A_PHONE_WITH_A_NOTCH = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const on = async (phone: typeof A_PHONE_WITH_A_NOTCH, node: ReactNode): Promise<void> => {
  await render(<SafeAreaProvider initialMetrics={phone}>{node}</SafeAreaProvider>);
};

/**
 * # The frame's one job that is not a colour
 *
 * A screen that is drawn with no chrome above it starts at pixel zero, and
 * pixel zero on a phone is underneath the clock and the battery. The first
 * APK shipped the sign-in screen exactly like that.
 *
 * So the frame keeps the status bar's height for itself. It is the TOP edge
 * only: the bottom belongs to whatever is down there — the tab bar inside the
 * navigator, and nothing at all outside it — and a frame that claimed it too
 * would push every list up off the gesture bar.
 */
describe("the frame every screen sits in", () => {
  it("keeps the status bar's height when it scrolls", async () => {
    await on(
      A_PHONE_WITH_A_NOTCH,
      <Screen>
        <Text>Sign in to Waymark</Text>
      </Screen>,
    );

    expect(screen.getByTestId("screen")).toHaveStyle({ paddingTop: 47 });
  });

  /**
   * The branch the two loading screens take, and the one it would be easy to
   * fix the other and forget.
   */
  it("keeps the status bar's height when it does not scroll", async () => {
    await on(
      A_PHONE_WITH_A_NOTCH,
      <Screen scroll={false}>
        <Text>Opening Waymark</Text>
      </Screen>,
    );

    expect(screen.getByTestId("screen")).toHaveStyle({ paddingTop: 47 });
  });

  /**
   * The inset is kept ABOVE the gutter rather than folded into it. A screen on
   * a phone with no notch still opens with its title a gutter from the top,
   * the way it always has.
   */
  it("leaves the gutter alone on a phone with nothing in the way", async () => {
    await on(
      { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
      <Screen>
        <Text>Sign in to Waymark</Text>
      </Screen>,
    );

    expect(screen.getByTestId("screen")).toHaveStyle({ paddingTop: 0 });
  });
});
