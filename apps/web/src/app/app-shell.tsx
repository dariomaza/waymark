import type { JSX } from "react";
import { Outlet } from "react-router-dom";

import { useSession, useSignOut } from "../auth/use-session.js";
import { Button } from "../ui/atoms/button.js";
import { Icon } from "../ui/atoms/icon.js";
import { useTranslate } from "./language-context.js";
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
  const t = useTranslate();

  return (
    <div className="app-shell">
      <AppBar
        title="Waymark"
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
              {t("shell.signOut")}
            </Button>
          </>
        }
      />
      <OfflineNote />
      {session === null ? null : (
        <p className="app-shell__who">
          {t("shell.signedInAs", { username: session.user.username })}
        </p>
      )}
      <Outlet />

      <BottomNav
        label={t("nav.label")}
        items={[
          /**
           * "Places" and "Things", not "Inventory" and "Items" — and the same
           * decision is made again in Spanish rather than translated out of
           * the English. See `nav.places` in the dictionary.
           */
          { to: ROUTES.inventory, label: t("nav.places"), icon: "tree" },
          { to: ROUTES.everything, label: t("nav.things"), icon: "things" },
          { to: ROUTES.find, label: t("nav.search"), icon: "search" },
          { to: ROUTES.scan, label: t("nav.scan"), icon: "scan" },
        ]}
      />
    </div>
  );
};
