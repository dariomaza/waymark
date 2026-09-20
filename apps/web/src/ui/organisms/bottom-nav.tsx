import type { JSX } from "react";
import { NavLink } from "react-router-dom";

import "./bottom-nav.css";

export interface BottomNavItem {
  readonly to: string;
  readonly label: string;
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
        {item.label}
      </NavLink>
    ))}
  </nav>
);
