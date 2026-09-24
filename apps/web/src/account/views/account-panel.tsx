import type { JSX, ReactNode } from "react";

import { useTranslate } from "../../app/language-context.js";
import { Avatar } from "../../ui/atoms/avatar.js";
import { Button } from "../../ui/atoms/button.js";
import "./account-panel.css";

export interface AccountPanelProps {
  /** `null` only in the instant between the session going and the screen doing. */
  readonly username: string | null;
  /** The control that is ABOUT the language rather than written in it. */
  readonly language: ReactNode;
  /** The devices that can open this account. Injected; it fetches and mutates. */
  readonly passkeys: ReactNode;
  /**
   * Credentials for programs. Injected, because it fetches and mutates and this
   * file draws.
   *
   * It goes UNDER the language and ABOVE the way out, which is the order of how
   * often each is wanted and how final each is. Signing out is last on purpose:
   * it is the one control here that ends the session, and a destructive button
   * above a list somebody is scrolling is a button that gets hit by a thumb
   * reaching past it.
   */
  readonly machineTokens: ReactNode;
  readonly busy: boolean;
  readonly onSignOut: () => void;
}

/**
 * Presentational. It draws a name, the controls it was handed, and a button —
 * and knows what a session is as little as the login form does.
 *
 * The big avatar beside the name is the same shape as the small one in the
 * bar, which is what makes the tab legible in the other direction: the circle
 * you tapped and the circle you arrived at are the same thing. It is the phone's
 * panel, laid out the way the phone lays it out, because that is the point.
 */
export const AccountPanel = ({
  username,
  language,
  passkeys,
  machineTokens,
  busy,
  onSignOut,
}: AccountPanelProps): JSX.Element => {
  const t = useTranslate();

  return (
    <div className="account-panel">
      <h2>{t("account.title")}</h2>
      <p className="account-panel__lede">{t("account.lede")}</p>

      {username === null ? null : (
        <div className="account-panel__who">
          {/*
            Decorative here, deliberately: the sentence beside it says the whole
            name, and announcing "D" first would be reading the abbreviation
            instead of the answer.
          */}
          <Avatar name={username} size={44} filled />
          <p className="account-panel__name">{t("shell.signedInAs", { username })}</p>
        </div>
      )}

      <div className="account-panel__setting">{language}</div>

      {passkeys}

      {machineTokens}

      {/*
        The door, in front of the word. Signing out is not destructive and it is
        not reversible either — somebody who meant to leave this screen and hit
        it has to sign in again — so it keeps its sentence and gains a shape.
      */}
      <Button
        tone="danger"
        block
        icon="signOut"
        disabled={busy}
        onClick={onSignOut}
      >
        {t("shell.signOut")}
      </Button>
    </div>
  );
};
