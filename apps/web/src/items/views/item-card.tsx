import type { JSX, ReactNode } from "react";
import { Link } from "react-router-dom";

import { initialsOf } from "@ariadna/api-client";

import "./item-card.css";

export interface ItemCardProps {
  readonly to: string;
  readonly name: string;
  /**
   * The one line a card has room for under the name, and it means different
   * things in different places: the tags inside a unit, where the location
   * would be the same string on every card; the containing unit's name in
   * search and in everything-you-own, where each result is somewhere else.
   *
   * It is a PROP rather than a decision this card makes, because a card that
   * knows which screen it is on grows a branch per screen and then nobody can
   * say which one is live.
   */
  readonly secondary?: string | undefined;
  /** How many of it, when that is more than one. */
  readonly quantity?: number | undefined;
  /** The cover photo. Absent means there is none yet, not that it is loading. */
  readonly photo?: ReactNode;
  /** A checkbox, when the screen is selecting things. */
  readonly trailing?: ReactNode;
}

/**
 * One thing, as a square.
 *
 * A thing is recognised by its picture, which is the whole reason this is not
 * a row: a drawn box is the same drawing for a drill and for a bag of screws,
 * and the photograph is not.
 */
export const ItemCard = ({
  to,
  name,
  secondary,
  quantity,
  photo,
  trailing,
}: ItemCardProps): JSX.Element => (
  <div className="item-card">
    <Link className="item-card__target" to={to}>
      <span className="item-card__image">
        {photo ?? (
          /**
           * Not a spinner and not an icon: the initials say WHICH thing this
           * is while saying it has no picture. Hidden from assistive
           * technology because the name is right underneath — reading "CA"
           * aloud before "Cinta aislante" is noise.
           */
          <span className="item-card__initials" aria-hidden="true">
            {initialsOf(name)}
          </span>
        )}
        {quantity === undefined || quantity <= 1 ? null : (
          /**
           * Over the photo, not under the name. In a card the name is what
           * truncates, and "×8" is exactly the part that must not.
           */
          <span className="item-card__quantity">×{quantity}</span>
        )}
      </span>
      <span className="item-card__text">
        <span className="item-card__name">{name}</span>
        {secondary === undefined || secondary === "" ? null : (
          <span className="item-card__secondary">{secondary}</span>
        )}
      </span>
    </Link>
    {trailing === undefined ? null : <div className="item-card__trailing">{trailing}</div>}
  </div>
);
