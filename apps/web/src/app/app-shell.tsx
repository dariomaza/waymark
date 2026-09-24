import type { JSX } from "react";
import { Outlet } from "react-router-dom";

import { useSession } from "../auth/use-session.js";
import { Icon } from "../ui/atoms/icon.js";
import { AccountSheet } from "./account-sheet.js";
import { useTranslate } from "./language-context.js";
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
  const t = useTranslate();

  return (
    <div className="app-shell">
      <AppBar
        title="Waymark"
        leading={
          /*
            * The product's MARK, and the phone draws it lime. It carried no
            * colour here, so it inherited the ink beside it and came out
            * white — one mark, two colours, on one phone. The wrapper is what
            * the colour hangs on: `leading` is a slot, and a back arrow put
            * in it later has no business being the accent.
            */
          <span className="app-shell__mark">
            <Icon name="waypoints" size={24} />
          </span>
        }
        /*
          * `null` cannot happen here: this shell is only ever drawn inside
          * `RequireSession`, which sends anybody without a session to the
          * login screen before it renders. It is written out rather than
          * asserted away because the alternative is an avatar with no letter
          * in it, which is a circle that means nothing.
          */
        actions={session === null ? undefined : <AccountSheet username={session.user.username} />}
      />
      <OfflineNote />
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
