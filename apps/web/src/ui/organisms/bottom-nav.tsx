import type { JSX } from "react";
import { NavLink } from "react-router-dom";

import { Icon, type IconName } from "../atoms/icon.js";
import "./bottom-nav.css";

export interface BottomNavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
}

export interface BottomNavProps {
  readonly items: readonly BottomNavItem[];
}

/**
 * The navigation sits at the BOTTOM.
 *
 * This app is held in one hand, often while the other one is holding the box.
 * The top of a phone is where you put things you rarely tap; the bottom is
 * where the thumb already is. Search lives here because it is the reason the
 * product exists, not three taps into a menu.
 *
 * Each destination is an icon with its word under it, and the word stays.
 * An icon only carries meaning on its own when it is conventional: a magnifier
 * is search everywhere in the world, but no shape means "places" or "things",
 * so those two would have to be learned by tapping them and finding out. The
 * label costs eleven pixels and removes that.
 *
 * The icon is hidden from assistive technology precisely because the word is
 * there: announcing the picture and the word would say the same thing twice.
 */
export const BottomNav = ({ items }: BottomNavProps): JSX.Element => (
  <nav className="bottom-nav" aria-label="Main">
    {items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) =>
          `bottom-nav__link${isActive ? " bottom-nav__link--current" : ""}`
        }
      >
        <Icon name={item.icon} size={22} />
        <span className="bottom-nav__label">{item.label}</span>
      </NavLink>
    ))}
  </nav>
);
