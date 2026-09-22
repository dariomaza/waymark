import type { JSX } from "react";
import { Outlet } from "react-router-dom";

import { useSession, useSignOut } from "../auth/use-session.js";
import { Button } from "../ui/atoms/button.js";
import { Icon } from "../ui/atoms/icon.js";
import { LanguageSwitcher } from "./language-switcher.js";
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
        leading={<Icon name="thread" size={24} />}
        actions={
          <>
            <LanguageSwitcher />
            <Button
              tone="quiet"
              onClick={() => {
                signOut.mutate();
              }}
            >
              Sign out
            </Button>
          </>
        }
      />
      <OfflineNote />
      {session === null ? null : (
        <p className="app-shell__who">Signed in as {session.user.username}</p>
      )}
      <Outlet />

      <BottomNav
        items={[
          /**
           * "Places" and "Things", not "Inventory" and "Items".
           *
           * The two words a person uses standing in a garage are where and
           * what. "Inventory" is the name of the database; the tab is for the
           * person, so it takes the person's word.
           */
          { to: ROUTES.inventory, label: "Places", icon: "tree" },
          { to: ROUTES.everything, label: "Things", icon: "things" },
          { to: ROUTES.find, label: "Search", icon: "search" },
          { to: ROUTES.scan, label: "Scan", icon: "scan" },
        ]}
      />
    </div>
  );
};
