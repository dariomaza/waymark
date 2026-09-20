import type { JSX } from "react";

/**
 * The composition root of the client.
 *
 * Everything the app can DO lives in a folder named after it — `auth`,
 * `units`, `items`, `search`, `scanning`, `photos`. This folder is the only
 * one that knows they exist at once: it wires the providers, the routes and
 * the shell around them. A feature folder never imports another feature's
 * containers, so what the app does stays readable from the directory listing.
 */
export const App = (): JSX.Element => (
  <div className="app">
    <header className="app__bar">
      <h1 className="app__title">Ariadna</h1>
    </header>
  </div>
);
