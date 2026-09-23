import type { PasskeyView } from "@waymark/api-client";
import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { useLanguage, useTranslate } from "../../app/language-context.js";
import "./passkey-row.css";

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
 * One device, and the one thing that can be done to it.
 *
 * Presentational to the bone: it is handed a passkey and some callbacks, and
 * knows nothing about requests, caches or which of these is in flight.
 *
 * The confirmation is inline for the reason `MachineTokenRow` gives: this row
 * is already inside a sheet, and a sheet opened from inside a sheet is two
 * overlapping modals each claiming with `aria-modal` that nothing outside it
 * matters.
 *
 * The sentence it confirms with is the one that matters most in this feature:
 * removing a passkey cannot lock anybody out, because the password is still
 * there. Somebody about to remove their last one deserves to be told that
 * BEFORE they hesitate over the button (ADR 19).
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

  const when = (moment: string): string =>
    new Date(moment).toLocaleDateString(language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <li className="passkey">
      <div className="passkey__head">
        <span className="passkey__name">{passkey.label}</span>
      </div>

      <p className="passkey__facts">
        {/*
          Last used first, because it is what somebody came to read: a device
          nobody has used in a year is the one worth asking about.
        */}
        <span>
          {passkey.lastUsedAt === null
            ? t("passkeys.neverUsed")
            : t("passkeys.lastUsedOn", { when: when(passkey.lastUsedAt) })}
        </span>
        <span>{t("passkeys.addedOn", { when: when(passkey.createdAt) })}</span>
      </p>

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
        <div className="passkey__actions">
          <Button tone="quiet" onClick={onAsk}>
            {t("passkeys.removeAction")}
          </Button>
        </div>
      )}
    </li>
  );
};
