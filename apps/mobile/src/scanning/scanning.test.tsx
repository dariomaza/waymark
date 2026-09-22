import { aSession } from "@waymark/api-client/testing";

import { fakeScanner } from "../testing/fake-scanner.js";
import { renderApp, screen, act, fireEvent } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";

/**
 * # The reason this app exists
 *
 * A QR printed on a box encodes `<public base>/u/<publicId>` — a URL, because
 * Android's stock camera offers to OPEN one and merely offers to copy a
 * string. The camera tab reads the same thing and goes through the same front
 * door, so there is exactly one place that turns a code into a unit.
 *
 * Nothing here mocks a module. The camera is a port because a test runner has
 * no lens; the string it hands over goes through the real parser, the real
 * navigator, the real forest lookup and the real unit screen.
 */
describe("scanning a label", () => {
  it("opens the box the code names", async () => {
    theApiKnowsTheHouse();
    const camera = fakeScanner();

    await renderApp({ session: aSession(), scanner: camera });

    // The app opens on the camera. No tab to find first.
    expect(await screen.findByText(/scan a label/i)).toBeOnTheScreen();

    await act(async () => {
      camera.scan("https://ariadna.example/u/7ZK3QWERTY");
    });

    expect(await screen.findByRole("header", { name: "Box 3" })).toBeOnTheScreen();
    expect(await screen.findByText("Cordless drill")).toBeOnTheScreen();
  });

  /**
   * `WAYMARK_PUBLIC_BASE_URL` is a server setting, and the stickers already
   * glued to the boxes keep whatever it was when they were printed. A client
   * that only accepted its own host would stop reading them.
   */
  it("reads a label printed before the public base URL moved", async () => {
    theApiKnowsTheHouse();
    const camera = fakeScanner();

    await renderApp({ session: aSession(), scanner: camera });
    await screen.findByText(/scan a label/i);

    await act(async () => {
      camera.scan("http://some-old-host.lan:5173/u/7ZK3QWERTY");
    });

    expect(await screen.findByRole("header", { name: "Box 3" })).toBeOnTheScreen();
  });

  it("says so plainly when no box in the house carries that code", async () => {
    theApiKnowsTheHouse();
    const camera = fakeScanner();

    await renderApp({ session: aSession(), scanner: camera });
    await screen.findByText(/scan a label/i);

    await act(async () => {
      camera.scan("https://ariadna.example/u/9ZZ9ZZ9ZZ9");
    });

    // A clear sentence, not a 404 that reads like a bug in the app (ADR 12).
    expect(await screen.findByText(/no unit in this inventory/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Go to your inventory" })).toBeOnTheScreen();
  });

  it("refuses a QR that is not an Ariadna label at all", async () => {
    theApiKnowsTheHouse();
    const camera = fakeScanner();

    await renderApp({ session: aSession(), scanner: camera });
    await screen.findByText(/scan a label/i);

    await act(async () => {
      camera.scan("https://example.com/something-else");
    });

    expect(await screen.findByText(/not an ariadna label/i)).toBeOnTheScreen();
  });

  /**
   * The code is printed under the symbol precisely so it can be read aloud
   * across a garage and typed in when a label is scuffed past scanning.
   */
  it("opens the same box from the code typed in by hand", async () => {
    theApiKnowsTheHouse();

    await renderApp({ session: aSession() });

    await fireEvent.changeText(
      await screen.findByLabelText(/code printed under the symbol/i),
      "7zk3qwerty",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Open that unit" }));

    expect(await screen.findByRole("header", { name: "Box 3" })).toBeOnTheScreen();
  });
});
