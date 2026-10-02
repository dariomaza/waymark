import type { AccountView } from "@waymark/api-client";
import { Role } from "@waymark/domain";
import type { JSX } from "react";

import { Icon } from "../../ui/atoms/icon.js";
import { OverflowMenu, type OverflowAction } from "../../ui/molecules/overflow-menu.js";
import { useTranslate } from "../../app/language-context.js";
import "./person-row.css";

/** What a person's menu can lead to. Disabling and resetting are asked first. */
export type PersonAct = "role" | "reset" | "disable" | "enable";

export interface PersonRowProps {
  readonly account: AccountView;
  /** The administrator's own row: marked as theirs, and offering nothing. */
  readonly isYou: boolean;
  readonly onAct: (act: PersonAct) => void;
}

/**
 * One person in the house: their name, their role as a chip, whether they
 * are disabled, and a menu beside the name (ADR 21) with everything that can
 * be done to them.
 *
 * Presentational: it is handed an account and one callback, and knows
 * nothing about requests.
 *
 * ## Your own row has no menu
 *
 * Every line it would hold — a role change, a password reset, disabling — is
 * refused for your own account (`OWN_ACCOUNT`, ADR 26): another administrator
 * has to do it. A menu of refusals is worse than no menu, so there is none.
 * The panel still names the refusal should it ever come back.
 */
export const PersonRow = ({ account, isYou, onAct }: PersonRowProps): JSX.Element => {
  const t = useTranslate();

  const disabled = account.disabledAt !== null;
  const administrator = account.role === Role.ADMINISTRATOR;

  const actions: OverflowAction[] = [
    {
      label: administrator ? t("people.makeUser") : t("people.makeAdministrator"),
      onSelect: () => {
        onAct("role");
      },
    },
    {
      label: t("people.resetAction"),
      icon: "key",
      onSelect: () => {
        onAct("reset");
      },
    },
    disabled
      ? {
          label: t("people.enableAction"),
          onSelect: () => {
            onAct("enable");
          },
        }
      : {
          label: t("people.disableAction"),
          tone: "danger",
          destructive: true,
          onSelect: () => {
            onAct("disable");
          },
        },
  ];

  return (
    <li className="settings-item">
      <Icon name="person" size={20} />
      <span className="settings-item__text">
        <span className="settings-item__name">{account.username}</span>
        <span className="person__facts">
          <span className="person__role">
            {administrator ? t("people.roleAdministrator") : t("people.roleUser")}
          </span>
          {isYou ? <span className="settings-item__fact">{t("people.you")}</span> : null}
          {disabled ? (
            <span className="settings-item__fact person__disabled">{t("people.disabled")}</span>
          ) : null}
        </span>
      </span>

      {isYou ? null : (
        <span className="settings-item__actions">
          <OverflowMenu label={t("action.more", { name: account.username })} actions={actions} />
        </span>
      )}
    </li>
  );
};
