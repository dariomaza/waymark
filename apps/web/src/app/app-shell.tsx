import type { JSX } from "react";
import { Outlet } from "react-router-dom";

import { useSession, useSignOut } from "../auth/use-session.js";
import { Button } from "../ui/atoms/button.js";
import { AppBar } from "../ui/organisms/app-bar.js";
import { BottomNav } from "../ui/organisms/bottom-nav.js";
import "./app-shell.css";

/**
 * The frame every signed-in screen is drawn inside: a bar at the top and the
 * screen below it.
 *
 * A container — it knows who is signed in and how to end that — wrapped
 * around presentational parts that do not.
 */
export const AppShell = (): JSX.Element => {
  const session = useSession();
  const signOut = useSignOut();

  return (
    <div className="app-shell">
      <AppBar
        title="Ariadna"
        actions={
          <Button
            tone="quiet"
            onClick={() => {
              signOut.mutate();
            }}
          >
            Sign out
          </Button>
        }
      />
      {session === null ? null : (
        <p className="app-shell__who">Signed in as {session.user.username}</p>
      )}
      <Outlet />

      <BottomNav
        items={[
          { to: "/", label: "Inventory" },
          { to: "/items", label: "Items" },
          { to: "/search", label: "Search" },
          { to: "/scan", label: "Scan" },
        ]}
      />
    </div>
  );
};
