import { aSession } from "@waymark/api-client/testing";

import { renderApp, screen } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # Where the status bar is, and who is responsible for it
 *
 * The first APK drew "Sign in to Waymark" over the carrier, the clock and the
 * battery. Everything the app shows AFTER signing in has the top bar above it,
 * and that bar pads itself by the status bar — so the whole signed-in half of
 * the product looked right and the one screen everybody sees first did not.
 *
 * The screens outside the navigator are the sign-in screen and the two
 * loading states around it, and there is nothing above any of them. So the
 * frame itself keeps the status bar's height, and the top bar — the one thing
 * that has already spent it — says so to everything underneath it. These are
 * the two halves of that, asserted from the outside.
 *
 * `TEST_METRICS` in `app.tsx` is the phone these run on: 24 at the top.
 */
describe("what the status bar sits over", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  it("does not sit over the sign-in screen, which has nothing above it", async () => {
    await renderApp();

    await screen.findByText("Sign in to Waymark");

    expect(screen.getByTestId("screen")).toHaveStyle({ paddingTop: 24 });
  });

  /**
   * The other half, and the one a fix to the frame alone would break: every
   * signed-in screen has the top bar above it, which has already moved itself
   * out from under the clock. A frame that added the inset again there would
   * open a second status bar's worth of nothing under the bar, on every screen
   * in the app.
   */
  it("is already spent by the top bar, so the screens under it do not pay twice", async () => {
    await renderApp({ session: aSession() });

    await screen.findByText(/scan a label/i);

    const frames = screen.getAllByTestId("screen");
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame).toHaveStyle({ paddingTop: 0 });
    }
  });
});
