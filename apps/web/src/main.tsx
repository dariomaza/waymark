import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/app.js";
import "./ui/styles/tokens.css";
import "./ui/styles/base.css";

/**
 * The only file in the app that touches the document, and the only one that
 * picks a router. Everything below is the same code the tests drive.
 */
const container = document.querySelector("#root");
if (container === null) {
  throw new Error("index.html is missing its #root element");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
