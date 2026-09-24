import type { JSX, ReactNode } from "react";
import { NavLink } from "react-router-dom";

import "./bottom-nav.css";

export interface BottomNavItem {
  readonly to: string;
  /** The word under the drawing. Short enough to stay on one line in both languages. */
  readonly label: string;
  /**
   * The drawing. A `ReactNode` and not an icon NAME, because one of the five is
   * not an icon at all: the account is the person's own initial, which is the
   * one thing every product has already taught everybody means "this is about
   * me". Handing this component the rendered symbol keeps it presentational and
   * keeps the choice with the shell, which is the only place that knows who is
   * signed in.
   */
  readonly symbol: ReactNode;
  /**
   * What a screen reader announces, when the word alone is not the whole
   * sentence. "You" is two letters of context short of useful, so the account
   * tab names the person; the other four are their own word.
   */
  readonly name?: string;
}

export interface BottomNavProps {
  readonly items: readonly BottomNavItem[];
  /**
   * The name of the landmark itself, which a screen reader announces before
   * anything inside it. Handed in rather than written here for the same
   * reason the labels are: this component stays presentational, and the words
   * are the shell's to choose in whichever language is on screen.
   */
  readonly label: string;
}

/**
 * The navigation sits at the BOTTOM.
 *
 * This app is held in one hand, often while the other one is holding the box.
 * The top of a phone is where you put things you rarely tap; the bottom is
 * where the thumb already is. Search lives here because it is the reason the
 * product exists, not three taps into a menu.
 *
 * Each destination is a symbol with its word under it, and the word stays.
 * An icon only carries meaning on its own when it is conventional: a magnifier
 * is search everywhere in the world, but no shape means "places" or "things",
 * so those two would have to be learned by tapping them and finding out. The
 * label costs eleven pixels and removes that.
 *
 * The symbol is hidden from assistive technology precisely because the word is
 * there: announcing the picture and the word would say the same thing twice.
 */
export const BottomNav = ({ items, label }: BottomNavProps): JSX.Element => (
  <nav className="bottom-nav" aria-label={label}>
    {items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/"}
        {...(item.name === undefined ? {} : { "aria-label": item.name })}
        className={({ isActive }) =>
          `bottom-nav__link${isActive ? " bottom-nav__link--current" : ""}`
        }
      >
        {item.symbol}
        <span className="bottom-nav__label">{item.label}</span>
      </NavLink>
    ))}
  </nav>
);
