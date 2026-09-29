/**
 * # The mark, written once
 *
 * Waymark's mark is the name with a pin over its w: the corner square of a QR
 * code — the thing printed on every box — turned into a location pin, so that
 * the label on the box is the place you are looking for. ADR 24 records why it
 * replaced the three waypoints, and what it may and may not be drawn as.
 *
 * Both clients draw it from THESE numbers, the way they take their colours
 * from `palette.ts`. The old mark was written out twice, once per atom, and
 * ADR 20 named that as the one place the drift the icon library closed was
 * still open. It is closed here too: there is no second copy.
 *
 * ## Where the numbers come from
 *
 * The owner's logo kit, which is Sora SemiBold 600 (SIL OFL 1.1) converted to
 * outlines, in the font's own units: 1000 to the em, y growing downwards from
 * the baseline at 0. The letters are the kit's paths unchanged, rewritten
 * only into absolute `M L Q Z` commands.
 *
 * The pin in the kit is a 140-unit rounded square in its own 256-unit box —
 * corner radii 40, 12 and 8 for the outline, the ring's hole and the core,
 * with the bottom-right corner sharp — placed by
 *
 *     translate(456.5 -1122.8) scale(2.5398) rotate(45 128 118)
 *
 * The square is centred on the rotation's centre, so the turn swings its sharp
 * corner straight down onto the w. That transform is APPLIED here rather than
 * carried: every point below is the kit's point pushed through it, and every
 * radius is the kit's radius times 2.5398. A rotation and a uniform scale keep
 * a circle a circle and keep its sweep, so the arcs stay arcs. Nothing is a
 * redrawing; if the kit changes, these are re-derived from it, never traced.
 *
 * All of it is FILLS. The rest of the icon set is strokes on one weight; the
 * mark is a letterform, and a letter is an outline, not a pen.
 */

/** One filled outline. `evenOdd` is set where a contour inside it is a HOLE. */
export interface Shape {
  readonly d: string;
  readonly evenOdd?: boolean;
}

export interface Drawing {
  /** `x y width height`, in the drawing's own units. */
  readonly viewBox: string;
  /** The letters, in reading order. The w is always the first. */
  readonly letters: readonly Shape[];
  /** The pin over the w, drawn after the letters. */
  readonly pin: readonly Shape[];
}

/** Everything a drawing paints, in painting order. */
export const shapesOf = (drawing: Drawing): readonly Shape[] => [
  ...drawing.letters,
  ...drawing.pin,
];

/**
 * # The small cut, in the icon set's 24-unit box
 *
 * The w and a SOLID pin. At 24 pixels the full pin's hole is under a pixel
 * wide and its core two, so they close up into a smudge; the brand rule is
 * that anything 24px or smaller gets this cut instead.
 *
 * Placed the way every lucide shape is: inside a two-unit margin. The kit's
 * box around the w and the pin — x 20 to 990.94, y −1032.45 to 0 in font
 * units — is scaled by 20 / 1032.45 so its height is the 20 units from 2 to
 * 22, and its centre (505.47, −516.23) is moved to (12, 12). Three decimals,
 * which is a thousandth of a unit in a box drawn at 24 pixels.
 */
export const MARK_SMALL: Drawing = {
  viewBox: "0 0 24 24",
  letters: [
    {
      d: "M7.342 22L9.337 11.83L12.436 11.83L14.742 22L12.611 22L10.267 11.888L11.39 11.888L9.308 22ZM6.538 22L6.528 19.792L8.669 19.792L8.678 22ZM5.463 22L2.596 11.481L5.211 11.481L7.933 22ZM13.279 22L13.289 19.792L15.429 19.792L15.42 22ZM14.141 22L16.553 11.481L19.003 11.481L16.456 22Z",
    },
  ],
  pin: [
    {
      d: "M18.74 2.576L20.828 4.664A1.968 1.968 0 0 1 20.828 7.447L17.349 10.926L13.87 7.447A1.968 1.968 0 0 1 13.87 4.664L15.957 2.576A1.968 1.968 0 0 1 18.74 2.576Z",
    },
  ],
};

/**
 * # The logo: the name, with the full pin over its w
 *
 * In font units, so the letters are the kit's numbers exactly. The box is
 * the drawing's own extent — x 20 to 4526, and y from the pin's top at
 * −1032.45 down to the tail of the y at 214. The kit's file framed it at 193,
 * which cuts 21 units off the bottom of the y; this one does not.
 *
 * `width` and `height` are that box's size, for a caller that is handed a
 * height and has to work out the width that keeps the proportions.
 */
export const LOGO: Drawing & {
  readonly width: number;
  readonly height: number;
} = {
  viewBox: "20 -1033 4506 1247",
  width: 4506,
  height: 1247,
  letters: [
    /** w */
    {
      d: "M265 0L368 -525L528 -525L647 0L537 0L416 -522L474 -522L366.5 0ZM223.5 0L223 -114L333.5 -114L334 0ZM168 0L20 -543L155 -543L295.5 0ZM571.5 0L572 -114L682.5 -114L682 0ZM616 0L740.5 -543L867 -543L735.5 0Z",
    },
    /** a */
    {
      d: "M1284.5 0L1284.5 -161L1261.5 -161L1261.5 -340Q1261.5 -386.5 1238.5 -409.75Q1215.5 -433 1168 -433Q1143 -433 1108 -432Q1073 -431 1037.5 -429.5Q1002 -428 974 -426L974 -544Q997 -546 1025.75 -547.75Q1054.5 -549.5 1085.25 -550.25Q1116 -551 1143 -551Q1226.5 -551 1282.25 -528.75Q1338 -506.5 1366.25 -459.5Q1394.5 -412.5 1394.5 -336.5L1394.5 0ZM1109.5 14Q1050.5 14 1006.25 -6.75Q962 -27.5 937.5 -66.75Q913 -106 913 -161Q913 -220.5 942.25 -258.75Q971.5 -297 1025 -315.75Q1078.5 -334.5 1150.5 -334.5L1276.5 -334.5L1276.5 -251.5L1148.5 -251.5Q1101 -251.5 1075.5 -228.25Q1050 -205 1050 -167.5Q1050 -130.5 1075.5 -107.75Q1101 -85 1148.5 -85Q1177.5 -85 1202.25 -95.5Q1227 -106 1243.25 -131.25Q1259.5 -156.5 1261.5 -201L1295.5 -162Q1290.5 -105 1268 -66Q1245.5 -27 1206 -6.5Q1166.5 14 1109.5 14Z",
    },
    /** y */
    {
      d: "M1508 214L1508 95L1610 95Q1638.5 95 1658.25 87.75Q1678 80.5 1690.75 63.75Q1703.5 47 1711 18.5L1857 -543L1990 -543L1828.5 48.5Q1812.5 109 1783.75 145.5Q1755 182 1709.5 198Q1664 214 1597 214ZM1677 -12L1677 -122L1793 -122L1793 -12ZM1630 -12L1454 -543L1594 -543L1761 -12Z",
    },
    /** m */
    {
      d: "M2066 0L2066 -543L2176 -543L2176 -309.5L2166 -309.5Q2166 -391.5 2187 -447Q2208 -502.5 2249.5 -531.25Q2291 -560 2353 -560L2359 -560Q2421.5 -560 2463 -531.25Q2504.5 -502.5 2525.25 -447Q2546 -391.5 2546 -309.5L2511 -309.5Q2511 -391.5 2532.25 -447Q2553.5 -502.5 2595.25 -531.25Q2637 -560 2699 -560L2705 -560Q2767.5 -560 2809.75 -531.25Q2852 -502.5 2873.5 -447Q2895 -391.5 2895 -309.5L2895 0L2756 0L2756 -322.5Q2756 -374 2729.75 -404.5Q2703.5 -435 2656 -435Q2607.5 -435 2578.75 -403.5Q2550 -372 2550 -318.5L2550 0L2411 0L2411 -322.5Q2411 -374 2384.75 -404.5Q2358.5 -435 2311 -435Q2262.5 -435 2233.75 -403.5Q2205 -372 2205 -318.5L2205 0Z",
    },
    /** a */
    {
      d: "M3352.5 0L3352.5 -161L3329.5 -161L3329.5 -340Q3329.5 -386.5 3306.5 -409.75Q3283.5 -433 3236 -433Q3211 -433 3176 -432Q3141 -431 3105.5 -429.5Q3070 -428 3042 -426L3042 -544Q3065 -546 3093.75 -547.75Q3122.5 -549.5 3153.25 -550.25Q3184 -551 3211 -551Q3294.5 -551 3350.25 -528.75Q3406 -506.5 3434.25 -459.5Q3462.5 -412.5 3462.5 -336.5L3462.5 0ZM3177.5 14Q3118.5 14 3074.25 -6.75Q3030 -27.5 3005.5 -66.75Q2981 -106 2981 -161Q2981 -220.5 3010.25 -258.75Q3039.5 -297 3093 -315.75Q3146.5 -334.5 3218.5 -334.5L3344.5 -334.5L3344.5 -251.5L3216.5 -251.5Q3169 -251.5 3143.5 -228.25Q3118 -205 3118 -167.5Q3118 -130.5 3143.5 -107.75Q3169 -85 3216.5 -85Q3245.5 -85 3270.25 -95.5Q3295 -106 3311.25 -131.25Q3327.5 -156.5 3329.5 -201L3363.5 -162Q3358.5 -105 3336 -66Q3313.5 -27 3274 -6.5Q3234.5 14 3177.5 14Z",
    },
    /** r */
    {
      d: "M3592 0L3592 -543L3702 -543L3702 -313L3699 -313Q3699 -429.5 3749 -489.75Q3799 -550 3896 -550L3916 -550L3916 -429L3878 -429Q3807.5 -429 3769.25 -391.25Q3731 -353.5 3731 -282.5L3731 0Z",
    },
    /** k */
    {
      d: "M4369 0L4187 -253.5L4106 -253.5L4336.5 -543L4482 -543L4268.5 -276L4272 -345.5L4526 0ZM3989 0L3989 -730L4128 -730L4128 0Z",
    },
  ],
  pin: [
    /** The ring: the outline, and the hole inside it. */
    {
      d: "M853.43 -1002.69L961.19 -894.94A101.59 101.59 0 0 1 961.19 -751.27L781.59 -571.68L602 -751.27A101.59 101.59 0 0 1 602 -894.94L709.76 -1002.69A101.59 101.59 0 0 1 853.43 -1002.69ZM785.19 -927.27L885.76 -826.7A30.48 30.48 0 0 1 885.76 -783.59L763.64 -661.47L641.51 -783.59A30.48 30.48 0 0 1 641.51 -826.7L742.08 -927.27A30.48 30.48 0 0 1 785.19 -927.27Z",
      evenOdd: true,
    },
    /** The core, in the middle of the hole. */
    {
      d: "M778 -869.8L828.29 -819.51A20.32 20.32 0 0 1 828.29 -790.78L763.64 -726.12L698.98 -790.78A20.32 20.32 0 0 1 698.98 -819.51L749.27 -869.8A20.32 20.32 0 0 1 778 -869.8Z",
    },
  ],
};

/**
 * # The symbol: the w and the full pin, without the rest of the name
 *
 * The logo's own w and the logo's own pin — the same objects, not a copy —
 * framed from the pin's top down to the baseline. It is what a wait draws:
 * larger than an icon, so it takes the full pin with its ring and core
 * rather than the small cut. The loading animation moves `pin` and leaves
 * `letters` where they are (see `motion.ts`).
 */
const [W] = LOGO.letters as readonly [Shape, ...Shape[]];

export const SYMBOL: Drawing & {
  readonly width: number;
  readonly height: number;
} = {
  viewBox: "20 -1033 971 1033",
  width: 971,
  height: 1033,
  letters: [W],
  pin: LOGO.pin,
};
