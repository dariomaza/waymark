import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/app.js";

/**
 * The only file in the app that touches the document. Everything else is a
 * component, which is what lets the tests drive the real app rather than a
 * rehearsal of it.
 */
const container = document.querySelector("#root");
if (container === null) {
  throw new Error("index.html is missing its #root element");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
