import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LazyPhoto } from "./lazy-photo.js";

/**
 * These drive the DECISION to fetch, not the fetching. Whether the bytes then
 * arrive is `AuthenticatedImage`'s job and is covered where it is used.
 */
vi.mock("./authenticated-image.js", () => ({
  AuthenticatedImage: ({ src }: { readonly src: string }) => (
    <span data-testid="fetching">{src}</span>
  ),
}));

const observers: { callback: IntersectionObserverCallback; disconnected: boolean }[] = [];

const withObserver = (): void => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      readonly #entry: { callback: IntersectionObserverCallback; disconnected: boolean };

      constructor(callback: IntersectionObserverCallback) {
        this.#entry = { callback, disconnected: false };
        observers.push(this.#entry);
      }

      observe(): void {}
      unobserve(): void {}
      disconnect(): void {
        this.#entry.disconnected = true;
      }
    },
  );
};

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe("a photo that waits until it is nearly on screen", () => {
  it("does not ask for the bytes while it is far away", () => {
    withObserver();
    render(<LazyPhoto src="/photos/a/thumbnail" alt="" />);

    expect(screen.queryByTestId("fetching")).not.toBeInTheDocument();
  });

  it("asks once it comes into view", async () => {
    withObserver();
    render(<LazyPhoto src="/photos/a/thumbnail" alt="" />);

    observers[0]?.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(await screen.findByTestId("fetching")).toHaveTextContent("/photos/a/thumbnail");
  });

  /** Scrolling back and forth must not cancel and restart the same request. */
  it("stops watching once it has asked", async () => {
    withObserver();
    render(<LazyPhoto src="/photos/a/thumbnail" alt="" />);

    observers[0]?.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    await waitFor(() => {
      expect(observers[0]?.disconnected).toBe(true);
    });
  });

  /**
   * The failure mode that matters. Where the browser cannot say what is on
   * screen, an empty square forever would turn an optimisation into a bug —
   * so it loads instead.
   */
  it("just loads where the browser cannot tell it what is visible", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<LazyPhoto src="/photos/a/thumbnail" alt="" />);

    expect(await screen.findByTestId("fetching")).toBeInTheDocument();
  });
});
