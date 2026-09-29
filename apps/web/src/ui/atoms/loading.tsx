import type { JSX } from "react";

import { SYMBOL, WAIT_MARK_HEIGHT, type Shape } from "@waymark/tokens";

import "./loading.css";

export interface LoadingProps {
  /** Said out loud. "Loading" on its own tells a person nothing. */
  readonly label: string;
}

const paths = (shapes: readonly Shape[]): JSX.Element[] =>
  shapes.map((shape) => (
    <path
      key={shape.d}
      d={shape.d}
      {...(shape.evenOdd === true ? { fillRule: "evenodd" as const } : {})}
    />
  ));

/**
 * # A wait that is the mark finding its place
 *
 * The owner asked for the loading animation to be the logo: it is what the
 * logo was made for. So the w stays put and the pin drops onto it, settles,
 * rests and lifts, on the clock `PIN_DROP` in `@waymark/tokens` — the same
 * steps the phone's wait runs. It replaced a pulsing dot, which stood in for
 * a mark the product did not have yet.
 *
 * The symbol is the logo's own w and pin (`SYMBOL`), drawn in the mark's
 * colour: lime on the dark, ink on the light (ADR 24). The sentence beside it
 * is what is announced; the drawing is hidden, having nothing of its own to
 * say. Left aligned, on both clients, because a wait sits where the content
 * is about to appear and then nothing jumps when it arrives.
 */
export const Loading = ({ label }: LoadingProps): JSX.Element => (
  <p className="loading" role="status">
    <svg
      className="loading__mark"
      width={(WAIT_MARK_HEIGHT * SYMBOL.width) / SYMBOL.height}
      height={WAIT_MARK_HEIGHT}
      viewBox={SYMBOL.viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable={false}
    >
      <g className="loading__w">{paths(SYMBOL.letters)}</g>
      <g className="loading__pin">{paths(SYMBOL.pin)}</g>
    </svg>
    {label}
  </p>
);
