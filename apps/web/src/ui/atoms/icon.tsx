import type { JSX } from "react";

/**
 * The whole icon set, drawn here.
 *
 * No icon library. There are nine symbols in this product, and the smallest
 * useful icon package is hundreds of kilobytes plus a dependency to keep
 * current — for nine shapes that never change. These are the same paths the
 * mobile client draws, so the two clients look like one product.
 *
 * Every icon is a 24-unit square on a common stroke weight, which is what
 * stops a set drawn over time from looking like a set collected over time.
 */
export type IconName =
  /**
   * Three waypoints on a descending path: the product's mark.
   *
   * Named for what is drawn and not for the product, the way every other
   * name in this list is. The one before it was called `thread` — the thread
   * out of a labyrinth — which named a story rather than a shape, and when
   * the story changed the name was left pointing at nothing.
   */
  | "waypoints"
  | "scan"
  | "search"
  | "tree"
  | "things"
  | "box"
  | "tag"
  | "camera"
  | "plus";

const PATHS: Record<IconName, JSX.Element> = {
  /**
   * Rings and not dots, because a filled shape at this stroke weight reads as
   * a bullet point rather than as a marker — and the joining strokes stop at
   * each ring's edge rather than running under it, so the path is a route
   * BETWEEN the markers instead of a line with beads threaded on it.
   */
  waypoints: (
    <>
      <circle cx="5" cy="5.6" r="2.4" />
      <circle cx="12" cy="11.6" r="2.4" />
      <circle cx="19" cy="18.4" r="2.4" />
      <path d="M6.8 7.2l3.4 2.8M13.7 13.3l3.6 3.4" />
    </>
  ),
  scan: (
    <>
      <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <rect x="7" y="7" width="4" height="4" rx="1" />
      <rect x="13" y="13" width="4" height="4" rx="1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  tree: (
    <>
      <rect x="3" y="3.5" width="7" height="6" rx="1.5" />
      <rect x="14" y="14.5" width="7" height="6" rx="1.5" />
      <rect x="3" y="14.5" width="7" height="6" rx="1.5" />
      <path d="M6.5 9.5v5" />
    </>
  ),
  things: (
    <>
      <path d="M12 2.8l8 4.2v10L12 21.2 4 17V7z" />
      <path d="M4 7l8 4.2L20 7M12 11.2v10" />
    </>
  ),
  box: (
    <>
      <path d="M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
    </>
  ),
  tag: (
    <>
      <path d="M3 11V4.5A1.5 1.5 0 0 1 4.5 3H11l9.5 9.5a1.5 1.5 0 0 1 0 2.1l-6 6a1.5 1.5 0 0 1-2.1 0z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
};

export interface IconProps {
  readonly name: IconName;
  /** Pixels, square. Defaults to the size that reads on a phone. */
  readonly size?: number;
  /**
   * What this icon MEANS, when it carries meaning on its own.
   *
   * Left out, the icon is hidden from assistive technology — which is right
   * whenever there is a visible label beside it, because announcing the
   * picture and the word is announcing the same thing twice.
   */
  readonly label?: string;
}

export const Icon = ({ name, size = 22, label }: IconProps): JSX.Element => (
  <svg
    className="icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    // A decorative icon must be invisible to a screen reader, not merely
    // unlabelled: unlabelled still gets announced, as nothing useful.
    aria-hidden={label === undefined ? true : undefined}
    role={label === undefined ? undefined : "img"}
    aria-label={label}
    focusable={false}
  >
    {PATHS[name]}
  </svg>
);
