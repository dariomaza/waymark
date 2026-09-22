import { useEffect, useRef, useState, type JSX } from "react";

import { AuthenticatedImage } from "./authenticated-image.js";

export interface LazyPhotoProps {
  /** The path the API gave out, e.g. `/photos/abc/thumbnail`. */
  readonly src: string;
  readonly alt: string;
  readonly className?: string | undefined;
}

/**
 * A photo that is not fetched until it is nearly on screen.
 *
 * Every thumbnail here is an authenticated request — the bytes cannot ride on
 * a plain `<img src>`, because the inside of a house is behind the session —
 * so a grid of forty things is forty requests. Fetching them all at once on a
 * phone means the first screenful waits behind pictures nobody has scrolled
 * to yet.
 *
 * The margin is generous on purpose: starting the request when the card is
 * already visible trades a stall for a flash of empty box. Starting it a
 * screen early usually means the bytes are there before the card is.
 */
const START_LOADING_WITHIN = "400px";

export const LazyPhoto = ({ src, alt, className }: LazyPhotoProps): JSX.Element => {
  const anchor = useRef<HTMLSpanElement>(null);
  /**
   * Starts true where the browser cannot tell us what is on screen.
   *
   * `IntersectionObserver` is absent in jsdom and in older embedded
   * browsers, and the honest failure mode is to load the picture rather than
   * to leave a permanently empty square. A component that shows nothing when
   * a nice-to-have API is missing has turned an optimisation into a bug.
   */
  const [wanted, setWanted] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (wanted) {
      return undefined;
    }

    const element = anchor.current;
    if (element === null) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          // Once asked for, always asked for: scrolling back and forth must
          // not cancel and restart the same request.
          setWanted(true);
          observer.disconnect();
        }
      },
      { rootMargin: START_LOADING_WITHIN },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [wanted]);

  if (!wanted) {
    // The same box the picture will fill, so nothing moves when it arrives.
    return <span ref={anchor} className={["photo photo--placeholder", className ?? ""].filter(Boolean).join(" ")} />;
  }

  return <AuthenticatedImage src={src} alt={alt} {...(className === undefined ? {} : { className })} />;
};
