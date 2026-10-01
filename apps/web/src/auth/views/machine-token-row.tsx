import { MachineTokenScope, type ListedMachineTokenView } from "@waymark/api-client";
import { shortDate } from "@waymark/i18n";
import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { Icon } from "../../ui/atoms/icon.js";
import { useLanguage, useTranslate } from "../../app/language-context.js";
import "./machine-token-row.css";

/** Which confirmation this row is currently asking, if any. */
export type PendingAct = "rotate" | "revoke" | null;

export interface MachineTokenRowProps {
  readonly token: ListedMachineTokenView;
  readonly pending: PendingAct;
  readonly busy: boolean;
  readonly onAsk: (act: Exclude<PendingAct, null>) => void;
  readonly onCancel: () => void;
  readonly onConfirm: (act: Exclude<PendingAct, null>) => void;
}

/**
 * One credential, and the two things that can be done to it: a row of the
 * connected programs card, its scope a chip under its name and its two acts
 * two icons at the end — rotate, and the bin that revokes.
 *
 * Presentational to the bone: it is handed a token and some callbacks, and it
 * knows nothing about requests, caches or which of these is in flight.
 *
 * ## Why the confirmation is inline rather than a sheet
 *
 * It was first written for a row inside a sheet. A sheet opened from inside a sheet
 * is two overlapping modals, each claiming with `aria-modal` that nothing
 * outside it matters, which cannot both be true — and the focus trap of the
 * first would be fighting the second's.
 *
 * Inline is also the better shape for what is being asked. Rotating and
 * revoking are both destructive and both need a sentence about a consequence,
 * and that sentence belongs beside the credential it is about rather than in a
 * panel that has floated away from it.
 */
export const MachineTokenRow = ({
  token,
  pending,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: MachineTokenRowProps): JSX.Element => {
  const t = useTranslate();
  const language = useLanguage();

  const when = (moment: string): string => shortDate(moment, language);

  return (
    <li className="settings-item">
      {/* A key handed to a program: the same picture its row's words describe. */}
      <Icon name="key" size={20} />
      <span className="settings-item__text">
        <span className="settings-item__name machine-token__name">{token.name}</span>
        {/*
          One line of facts, what it may do first as a chip. Then `lastUsedAt`,
          because it is the column somebody came for: a credential nobody can
          see being used is one nobody will ever revoke. When it lapses is said
          only when it does.
        */}
        <span className="machine-token__facts">
          <span className="machine-token__scope">
            {token.scope === MachineTokenScope.ReadWrite
              ? t("tokens.scopeReadWrite")
              : t("tokens.scopeRead")}
          </span>
          <span className="settings-item__fact">
            {token.lastUsedAt === null
              ? t("tokens.neverUsed")
              : t("tokens.lastUsedOn", { when: when(token.lastUsedAt) })}
          </span>
          {token.expiresAt === null ? null : (
            <span className="settings-item__fact">
              {t("tokens.lapsesOn", { when: when(token.expiresAt) })}
            </span>
          )}
          {/* Only an administrator's list says whose a token is (ADR 26). */}
          {token.issuedBy === undefined ? null : (
            <span className="settings-item__fact">
              {t("tokens.issuedBy", { username: token.issuedBy })}
            </span>
          )}
        </span>
      </span>

      {pending === null ? (
        <span className="settings-item__actions">
          <Button
            tone="quiet"
            icon="rotate"
            aria-label={t("tokens.rotateAction")}
            onClick={() => {
              onAsk("rotate");
            }}
          />
          <Button
            tone="quiet"
            icon="trash"
            aria-label={t("tokens.revokeAction")}
            onClick={() => {
              onAsk("revoke");
            }}
          />
        </span>
      ) : (
        /**
         * `blocked` rather than `wrong`: this is a statement about the WORLD
         * and what is about to happen to it, not a complaint about a request
         * (ADR 8, as the tone of the box a sentence goes in).
         */
        <Callout
          tone="blocked"
          title={
            pending === "rotate"
              ? t("tokens.rotateTitle", { name: token.name })
              : t("tokens.revokeTitle", { name: token.name })
          }
        >
          <p>
            {pending === "rotate"
              ? t("tokens.rotateWarning", { name: token.name })
              : t("tokens.revokeWarning", { name: token.name })}
          </p>
          <div className="settings-group__buttons">
            <Button
              tone={pending === "revoke" ? "danger" : "primary"}
              disabled={busy}
              onClick={() => {
                onConfirm(pending);
              }}
            >
              {busy
                ? pending === "rotate"
                  ? t("tokens.rotating")
                  : t("tokens.revoking")
                : pending === "rotate"
                  ? t("tokens.rotateConfirm")
                  : t("tokens.revokeConfirm")}
            </Button>
            <Button tone="quiet" disabled={busy} onClick={onCancel}>
              {t("action.cancel")}
            </Button>
          </div>
        </Callout>
      )}
    </li>
  );
};
