import type { JSX } from "react";
import { Outlet } from "react-router-dom";

import { useSession } from "../auth/use-session.js";
import { Avatar } from "../ui/atoms/avatar.js";
import { Icon } from "../ui/atoms/icon.js";
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
      />
      <OfflineNote />
      <Outlet />

      {/*
        # Five destinations, in the phone's order, with Scan first

        This bar had four and the phone had five, in a different order, with the
        account in it — and the account was up in the top bar here, behind an
        avatar. The owner photographed both bars on one phone and that was the
        loudest thing on the screen. His standing decision settles the
        direction: both clients live on his phone, so the phone's shape wins
        (ADR 22).

        Scan first is an argument this client is INHERITING rather than
        inventing, and it was never about React Native — "the product is a
        printed QR on a box and a phone pointed at it; every tap between
        launching the app and the camera being live is a tap taken in a garage,
        one-handed, holding something". The PWA is installed on that same phone.

        "Places" and "Things", not "Inventory" and "Items" — and the same
        decision is made again in Spanish rather than translated out of the
        English. See `nav.places` in the dictionary.
      */}
      <BottomNav
        label={t("nav.label")}
        items={[
          {
            to: ROUTES.scan,
            label: t("nav.scan"),
            symbol: <Icon name="scan" size={22} />,
          },
          {
            to: ROUTES.inventory,
            label: t("nav.places"),
            symbol: <Icon name="tree" size={22} />,
          },
          {
            to: ROUTES.find,
            label: t("nav.search"),
            symbol: <Icon name="search" size={22} />,
          },
          {
            to: ROUTES.everything,
            label: t("nav.things"),
            symbol: <Icon name="things" size={22} />,
          },
          /*
            The fifth, and the only one that is not a place to look for a thing.

            It is drawn as the person's own initial rather than as a ninth icon,
            because no shape in any vocabulary means "your account" — a
            silhouette means "a person", which is the wrong person.

            The word under it is "You". The NAME announced beside it is the
            whole sentence, because "D" read aloud is one letter and a screen
            reader landing here should learn who is signed in rather than be
            handed an abbreviation to work out. `null` cannot happen: this shell
            is only drawn inside `RequireSession`.
          */
          {
            to: ROUTES.account,
            label: t("nav.you"),
            name: t("nav.youNamed", { username: session?.user.username ?? "" }),
            symbol: <Avatar name={session?.user.username ?? ""} size={22} />,
          },
        ]}
      />
    </div>
  );
};
