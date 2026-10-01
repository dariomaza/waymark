import type { PasskeyView } from "@waymark/api-client";
import { shortDate } from "@waymark/i18n";
import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { Icon } from "../../ui/atoms/icon.js";
import { useLanguage, useTranslate } from "../../app/language-context.js";

export interface PasskeyRowProps {
  readonly passkey: PasskeyView;
  /** Whether this row is currently asking to be confirmed. */
  readonly asking: boolean;
  readonly busy: boolean;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * One device, and the one thing that can be done to it: a row of the security
 * group's card, with a bin at the end of it.
 *
 * Presentational to the bone: it is handed a passkey and some callbacks, and
 * knows nothing about requests, caches or which of these is in flight.
 *
 * One line of facts, not two. When it was last used is what somebody came to
 * read — a device nobody has used in a year is the one worth asking about —
 * and when it was added answers nothing they are deciding.
 *
 * The confirmation is inline, under the row, and the sentence it confirms
 * with is the one that matters most in this feature: removing a passkey cannot
 * lock anybody out, because the password is still there. Somebody about to
 * remove their last one deserves to be told that BEFORE they hesitate over the
 * button (ADR 19).
 */
export const PasskeyRow = ({
  passkey,
  asking,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: PasskeyRowProps): JSX.Element => {
  const t = useTranslate();
  const language = useLanguage();

  const when = (moment: string): string => shortDate(moment, language);

  return (
    <li className="settings-item">
      <Icon name="key" size={20} />
      <span className="settings-item__text">
        <span className="settings-item__name">{passkey.label}</span>
        <span className="settings-item__fact">
          {passkey.lastUsedAt === null
            ? t("passkeys.neverUsed")
            : t("passkeys.lastUsedOn", { when: when(passkey.lastUsedAt) })}
        </span>
      </span>

      {asking ? (
        <Callout
          tone="blocked"
          title={t("passkeys.removeTitle", { name: passkey.label })}
          action={
            <>
              <Button tone="danger" disabled={busy} onClick={onConfirm}>
                {busy ? t("passkeys.removing") : t("passkeys.removeConfirm")}
              </Button>
              <Button tone="quiet" disabled={busy} onClick={onCancel}>
                {t("action.cancel")}
              </Button>
            </>
          }
        >
          <p>{t("passkeys.removeWarning", { name: passkey.label })}</p>
        </Callout>
      ) : (
        <span className="settings-item__actions">
          <Button
            tone="quiet"
            icon="trash"
            aria-label={t("passkeys.removeAction")}
            onClick={onAsk}
          />
        </span>
      )}
    </li>
  );
};
