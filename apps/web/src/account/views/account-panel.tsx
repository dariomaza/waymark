import type { JSX, ReactNode } from "react";

import { useTranslate } from "../../app/language-context.js";
import { Avatar } from "../../ui/atoms/avatar.js";
import { Button } from "../../ui/atoms/button.js";
import { SettingsGroup } from "../../ui/molecules/settings-group.js";
import "./account-panel.css";

export interface AccountPanelProps {
  /** `null` only in the instant between the session going and the screen doing. */
  readonly username: string | null;
  /** The language row of the preferences. */
  readonly language: ReactNode;
  /** The appearance row of the preferences: light, dark or the device's own (ADR 25). */
  readonly appearance: ReactNode;
  /** The password group: changing your own (ADR 26, amended). It mutates. */
  readonly password: ReactNode;
  /** The security group: the devices that can open this account. It fetches and mutates. */
  readonly passkeys: ReactNode;
  /**
   * The connected programs group: credentials for programs. Injected, because
   * it fetches and mutates and this file draws. Last, because the screen is
   * ordered from "you" outwards: how the app speaks to you, what opens your
   * account, then the programs you gave a key.
   */
  readonly machineTokens: ReactNode;
  /**
   * The people in the house (ADR 26), drawn by the group itself only for an
   * administrator and as nothing for anybody else. Last, because it is the
   * furthest out: not you, not your programs, but everybody else.
   */
  readonly people: ReactNode;
  readonly busy: boolean;
  readonly onSignOut: () => void;
}

/**
 * Presentational. It draws who is signed in, the way out, and the groups it
 * was handed — and knows what a session is as little as the login form does.
 *
 * ## The way out is beside the name
 *
 * It was a full-width word button at the bottom of everything, the last of a
 * column of look-alike word buttons. The owner wanted icons beside what they
 * act on, and signing out acts on the person whose name it sits beside. It is
 * a quiet 48 square rather than an outlined red one: it ends a session, it
 * does not delete anything.
 *
 * ## The screen's name is kept, and not drawn
 *
 * The bar already says "You" under the avatar that brought somebody here, so
 * a big title saying it again is a row of the phone spent on nothing. The
 * heading stays for a screen reader, which lands on it when the route changes.
 */
export const AccountPanel = ({
  username,
  language,
  appearance,
  password,
  passkeys,
  machineTokens,
  people,
  busy,
  onSignOut,
}: AccountPanelProps): JSX.Element => {
  const t = useTranslate();

  return (
    <div className="account-panel">
      <h2 className="account-panel__title">{t("account.title")}</h2>

      <div className="account-panel__who">
        {username === null ? null : (
          <>
            {/*
              Decorative here, deliberately: the name beside it is the answer,
              and announcing "D" first would be reading the abbreviation.
            */}
            <Avatar name={username} size={44} filled />
            <p className="account-panel__name">
              <span className="account-panel__username">{username}</span>
              <span className="account-panel__state">{t("account.signedIn")}</span>
            </p>
          </>
        )}
        <Button
          tone="quiet"
          icon="signOut"
          className="account-panel__out"
          aria-label={t("shell.signOut")}
          disabled={busy}
          onClick={onSignOut}
        />
      </div>

      <SettingsGroup title={t("account.preferences")}>
        {language}
        {appearance}
      </SettingsGroup>

      {password}

      {passkeys}

      {machineTokens}

      {people}
    </div>
  );
};
