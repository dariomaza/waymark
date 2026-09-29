import type { JSX } from "react";

import { LOGO, shapesOf } from "@waymark/tokens";

export interface LogoProps {
  /**
   * What the logo says: the product's name. Required, because the logo IS
   * the name wherever it stands — there is no word beside it to carry it.
   */
  readonly label: string;
  /** Pixels. The width follows from the drawing's own proportions. */
  readonly height?: number;
}

/**
 * # The name, drawn
 *
 * "waymark" in Sora SemiBold, outlined, with the pin over its w (ADR 24). It
 * is drawn from `LOGO` in `@waymark/tokens`, the same numbers the phone draws,
 * and filled in `currentColor` so the caller's colour is the logo's colour.
 *
 * Not an entry in the icon set: an icon is a square on a stroke, and this is
 * four and a half squares of letters. The mark alone, at icon size, is
 * `pinnedW` in `icon.tsx`.
 *
 * The default height is the icon size, which draws the letters at roughly
 * the size the name used to be typed in the top bar.
 */
export const Logo = ({ label, height = 24 }: LogoProps): JSX.Element => (
  <svg
    className="logo"
    width={(height * LOGO.width) / LOGO.height}
    height={height}
    viewBox={LOGO.viewBox}
    fill="currentColor"
    role="img"
    aria-label={label}
    focusable={false}
  >
    {shapesOf(LOGO).map((shape) => (
      <path
        key={shape.d}
        d={shape.d}
        {...(shape.evenOdd === true ? { fillRule: "evenodd" as const } : {})}
      />
    ))}
  </svg>
);
