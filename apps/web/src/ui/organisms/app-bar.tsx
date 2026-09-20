import type { JSX, ReactNode } from "react";

import "./app-bar.css";

export interface AppBarProps {
  readonly title: string;
  /** Sits on the left, before the title. A back link, usually. */
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
}

/**
 * The top bar. Presentational to the bone: it is handed a title and some
 * buttons and knows nothing about what any of them do.
 */
export const AppBar = ({ title, leading, actions }: AppBarProps): JSX.Element => (
  <header className="app-bar">
    {leading === undefined ? null : <div className="app-bar__leading">{leading}</div>}
    <h1 className="app-bar__title">{title}</h1>
    {actions === undefined ? null : <div className="app-bar__actions">{actions}</div>}
  </header>
);
