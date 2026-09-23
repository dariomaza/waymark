import { useState, type JSX } from "react";

import { MachineTokensPanel } from "../auth/machine-tokens-panel.js";
import { PasskeysPanel } from "../auth/passkeys-panel.js";
import { useSignOut } from "../auth/use-session.js";
import { Avatar } from "../ui/atoms/avatar.js";
import { Button } from "../ui/atoms/button.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useTranslate } from "./language-context.js";
import { LanguageSwitcher } from "./language-switcher.js";
import "./account-sheet.css";

export interface AccountSheetProps {
  readonly username: string;
}

/**
 * # Everything that belongs to YOU rather than to the inventory
 *
 * One circle in the bar with a letter in it, and behind it the three things
 * that are about the person rather than about the boxes: who is signed in,
 * which language they read, and the way out.
 *
 * It replaces a line that said "Signed in as dario" above every single
 * screen. In a household with one shared inventory (ADR 5) that sentence
 * answers a question nobody asks twice, and it was charging a row of the
 * screen somebody stands in a garage reading. The sentence is not deleted —
 * it is inside, and it is the avatar's accessible name, so the one person who
 * cannot see the letter is told without opening anything.
 *
 * ## A dialog, not a menu, and not a page
 *
 * What is behind it is a small GROUP OF CONTROLS, not a list of commands to
 * pick one of, and the difference decides the role.
 *
 * `role="menu"` is a promise of arrow keys, Home, End and typeahead, and its
 * children have to be menu items. The language switcher is a real `fieldset`
 * of radios with a legend, chosen deliberately so that a keyboard and a
 * screen reader get the grouping from the platform rather than from us; put
 * it in a menu and it has to be rebuilt out of `menuitemradio` and lose that.
 * Rewriting a working, tested, accessible control so that a role name fits is
 * the wrong way round.
 *
 * A page of its own — `/you` — was the other candidate. It costs a navigation
 * away from the inventory and back for two controls, and one more address in
 * an origin that has exactly one namespace to spend (ADR 16).
 *
 * So it is the `Sheet` every other question in this app is asked with, which
 * already is `role="dialog"` with `aria-modal="true"`, already labelled by
 * its title, already takes the focus, traps Tab, closes on Escape and hands
 * the focus back to whatever opened it. None of that had to be written again,
 * and all of it is already tested. It comes up from the bottom for the reason
 * the navigation lives down there: that is where the thumb already is.
 *
 * A container: it owns whether the sheet is open and how a session ends.
 * Everything it draws is presentational.
 */
export const AccountSheet = ({ username }: AccountSheetProps): JSX.Element => {
  const t = useTranslate();

  const signOut = useSignOut();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        tone="quiet"
        className="account__opener"
        aria-label={t("shell.accountOf", { username })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Avatar name={username} />
      </Button>

      {open ? (
        <Sheet
          title={t("shell.account")}
          onClose={() => {
            setOpen(false);
          }}
        >
          <p className="account__who">{t("shell.signedInAs", { username })}</p>

          <div className="account__controls">
            <LanguageSwitcher />

            {/*
              Credentials for programs (ADR 18). They belong here rather than
              on a screen of their own for the same reason the language does:
              this is the surface for everything that is YOURS rather than the
              inventory's, and a machine token is a key you hold.

              It is the tallest thing in this sheet by a long way, which is
              what made the sheet's own scrolling worth fixing first: on a
              short phone this list pushes Sign out past the bottom, and
              `sheet.css` now scrolls the body rather than losing it.
            */}
            {/*
              The devices that can open this account (ADR 19). Above the
              machine tokens, because these are about the person holding the
              phone and those are about programs — and this sheet is ordered
              from "you" outwards.
            */}
            <PasskeysPanel />

            <MachineTokensPanel />

            {/*
              The door, in front of the word. Signing out is not destructive
              and it is not reversible either — somebody who meant to close
              the sheet and hit this has to sign in again — so it keeps its
              sentence and gains a shape to aim at.
            */}
            <Button
              tone="danger"
              icon="signOut"
              onClick={() => {
                signOut.mutate();
              }}
            >
              {t("shell.signOut")}
            </Button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
};
