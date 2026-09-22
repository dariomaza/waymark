import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";

import { App } from "./app/app.js";
import { printConsoleSignature } from "./app/console-signature.js";
import "./ui/styles/tokens.css";
import "./ui/styles/base.css";

/**
 * The only file in the app that touches the document, picks a router, or
 * installs a service worker. Everything below is the same code the tests
 * drive.
 */
const container = document.querySelector("#root");
if (container === null) {
  throw new Error("index.html is missing its #root element");
}

printConsoleSignature();

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

/**
 * The app shell, kept on the device.
 *
 * `immediate` so the very first visit is already installable and already
 * works offline afterwards — somebody who scans a box once should not have
 * to visit twice before the app opens without signal. Updates are applied on
 * the next load rather than by reloading under somebody's thumb.
 */
registerSW({ immediate: true });
