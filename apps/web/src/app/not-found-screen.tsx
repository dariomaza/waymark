import type { JSX } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "./routes.js";

export const NotFoundScreen = (): JSX.Element => (
  <main className="screen">
    <h2>There is nothing at this address</h2>
    <p>The link may be old, or mistyped.</p>
    <Link to={ROUTES.inventory}>Back to your inventory</Link>
  </main>
);
