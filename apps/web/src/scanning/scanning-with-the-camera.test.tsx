import { publicId } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { sessionStore } from "../auth/session-store.js";
import { apiServer, API_URL } from "../testing/api-server.js";
import { aSession, aStorageUnit, aTree, withPhoto } from "@waymark/api-client/testing";
import { publicIdFromScannedText } from "@waymark/api-client";

import { renderApp, screen, userEvent } from "../testing/render-app.js";
import { CameraUnavailable, type QrScanner } from "./qr-scanner.js";

const garage = aStorageUnit({ id: "garage", name: "Garage", kind: "ROOM" });
const box = aStorageUnit({
  id: "box3",
  parentId: "garage",
  name: "Box 3",
  publicId: "7ZK3QWERTY",
});

/** Stands in for the camera, which jsdom does not have and never will. */
const aCameraThatReads = (text: string): QrScanner => ({
  start: async (_video, onDecoded) => {
    setTimeout(() => {
      onDecoded(text);
    }, 0);

    return () => {
      /* nothing to stop */
    };
  },
});

const aCameraThatIsBlocked = (): QrScanner => ({
  start: async () => {
    throw new CameraUnavailable("the browser refused access to the camera");
  },
});

describe("reading a label with the camera", () => {
  beforeEach(() => {
    sessionStore.save(aSession());
    apiServer.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ user: { id: "u1", username: "dario" } }),
      ),
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: [aTree(garage, [aTree(box)])] }),
      ),
      http.get(`${API_URL}/storage-units/box3`, () =>
        HttpResponse.json({ unit: withPhoto(box), path: [garage, box], children: [], items: [] }),
      ),
    );
  });

  it("opens the box whose sticker was in front of the lens", async () => {
    renderApp({
      route: "/scan",
      scanner: aCameraThatReads("https://waymark.example/u/7ZK3QWERTY"),
    });

    expect(await screen.findByRole("heading", { name: "Box 3" })).toBeVisible();
  });

  it("says a code is not one of ours rather than wandering off to it", async () => {
    renderApp({
      route: "/scan",
      scanner: aCameraThatReads("https://example.com/something-else"),
    });

    expect(await screen.findByText(/not a waymark label/i)).toBeVisible();
  });

  it("offers the code by hand when the camera cannot be used", async () => {
    renderApp({ route: "/scan", scanner: aCameraThatIsBlocked() });

    expect(await screen.findByText(/camera could not be started/i)).toBeVisible();

    await userEvent.type(
      screen.getByRole("textbox", { name: /code printed under/i }),
      "7ZK3QWERTY",
    );
    await userEvent.click(screen.getByRole("button", { name: /open that unit/i }));

    expect(await screen.findByRole("heading", { name: "Box 3" })).toBeVisible();
  });
});

describe("what a scanned code says", () => {
  it("reads the public id out of the URL a label encodes", () => {
    expect(publicIdFromScannedText("https://waymark.example/u/7ZK3QWERTY")).toBe(
      publicId("7ZK3QWERTY"),
    );
  });

  it("does not care about a trailing slash or a query string", () => {
    expect(publicIdFromScannedText("https://waymark.example/u/7ZK3QWERTY/?x=1")).toBe(
      publicId("7ZK3QWERTY"),
    );
  });

  it("accepts a bare code, for one typed in by hand", () => {
    expect(publicIdFromScannedText(" 7zk3qwerty ")).toBe(publicId("7ZK3QWERTY"));
  });

  it("refuses anything else, whatever host it came from", () => {
    expect(publicIdFromScannedText("https://example.com/")).toBeNull();
    expect(publicIdFromScannedText("https://waymark.example/units/box3")).toBeNull();
    expect(publicIdFromScannedText("")).toBeNull();
  });
});
