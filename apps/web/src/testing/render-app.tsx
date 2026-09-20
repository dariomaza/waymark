import { render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { App } from "../app/app.js";

export interface RenderAppOptions {
  /** The URL the browser is at. `/u/<publicId>` is a scanned label. */
  readonly route?: string;
}

/**
 * Renders the WHOLE app at a URL, the way a browser would.
 *
 * Not a screen in isolation: the routes, the guards, the query cache and the
 * real HTTP client are all in play, and the only thing standing in for the
 * outside world is MSW answering the API. That is what lets a test say "a
 * person opened a scanned label while logged out and ended up looking at that
 * box" rather than "this component rendered".
 */
export const renderApp = ({ route = "/" }: RenderAppOptions = {}): RenderResult =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );

export { screen, waitFor, waitForElementToBeRemoved, within } from "@testing-library/react";
export { userEvent };
