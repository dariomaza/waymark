import type { JSX } from "react";
import { Outlet } from "react-router-dom";

import { useSession, useSignOut } from "../auth/use-session.js";
import { Button } from "../ui/atoms/button.js";
import { AppBar } from "../ui/organisms/app-bar.js";
import { BottomNav } from "../ui/organisms/bottom-nav.js";
import { OfflineNote } from "./offline-note.js";
import "./app-shell.css";
import { ROUTES } from "./routes.js";

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
      <OfflineNote />
      {session === null ? null : (
        <p className="app-shell__who">Signed in as {session.user.username}</p>
      )}
      <Outlet />

      <BottomNav
        items={[
          { to: ROUTES.inventory, label: "Inventory" },
          { to: ROUTES.everything, label: "Items" },
          { to: ROUTES.search, label: "Search" },
          { to: ROUTES.scan, label: "Scan" },
        ]}
      />
    </div>
  );
};
