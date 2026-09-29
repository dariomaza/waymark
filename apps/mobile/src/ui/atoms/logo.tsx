import type { JSX } from "react";
import { Path, Svg } from "react-native-svg";

import { LOGO, shapesOf } from "@waymark/tokens";

import { useColors } from "../styles/theme.js";

export interface LogoProps {
  /** Points. The width follows from the drawing's own proportions. */
  readonly height?: number;
  /**
   * The fill. The mark's own colour unless the caller means something by it:
   * lime on the dark, ink on the light, never lime on white (ADR 24).
   */
  readonly color?: string;
  /**
   * What the logo says, when it stands for the name on its own. Left out, it
   * is hidden from assistive technology — which is right inside something
   * that already carries the name, like the top bar's header.
   */
  readonly label?: string | undefined;
}

/**
 * # The name, drawn
 *
 * "waymark" in Sora SemiBold, outlined, with the pin over its w (ADR 24). It
 * is drawn from `LOGO` in `@waymark/tokens`, the same numbers the browser
 * draws its top bar from.
 *
 * Not an entry in the icon set: an icon is a square on a stroke, and this is
 * four and a half squares of letters. The mark alone, at icon size, is
 * `pinnedW` in `icon.tsx`.
 *
 * The default height is the icon size, which draws the letters at roughly
 * the size the name used to be typed in the top bar.
 */
export const Logo = ({ height = 24, color: given, label }: LogoProps): JSX.Element => {
  const colors = useColors();
  const color = given ?? colors.mark;

  return (
    <Svg
      width={(height * LOGO.width) / LOGO.height}
      height={height}
      viewBox={LOGO.viewBox}
      fill={color}
      {...(label === undefined
        ? {
            accessible: false,
            accessibilityElementsHidden: true,
            importantForAccessibility: "no-hide-descendants" as const,
          }
        : { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label })}
    >
      {shapesOf(LOGO).map((shape) => (
        <Path
          key={shape.d}
          d={shape.d}
          {...(shape.evenOdd === true ? { fillRule: "evenodd" as const } : {})}
        />
      ))}
    </Svg>
  );
};
