import type { JSX, ReactNode } from "react";
import { Link } from "react-router-dom";

import "./row-link.css";

export interface RowLinkProps {
  readonly to: string;
  readonly title: string;
  /** A kind, a count, a location — whatever makes the row identifiable. */
  readonly meta?: string | undefined;
  /** A thumbnail, usually. */
  readonly leading?: ReactNode;
  /** Sits outside the link, so a checkbox or a menu is its own target. */
  readonly trailing?: ReactNode;
}

/**
 * One tappable line in a list: the whole row is the target, and it is tall
 * enough to hit while holding a box in the other hand.
 */
export const RowLink = ({
  to,
  title,
  meta,
  leading,
  trailing,
}: RowLinkProps): JSX.Element => (
  <div className="row-link">
    <Link className="row-link__target" to={to}>
      {leading === undefined ? null : <span className="row-link__leading">{leading}</span>}
      <span className="row-link__text">
        <span className="row-link__title">{title}</span>
        {meta === undefined ? null : <span className="row-link__meta">{meta}</span>}
      </span>
    </Link>
    {trailing === undefined ? null : <div className="row-link__trailing">{trailing}</div>}
  </div>
);
