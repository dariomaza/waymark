import { MachineTokenScope, type MachineTokenView } from "@waymark/api-client";
import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { useLanguage, useTranslate } from "../../app/language-context.js";
import "./machine-token-row.css";

/** Which confirmation this row is currently asking, if any. */
export type PendingAct = "rotate" | "revoke" | null;

export interface MachineTokenRowProps {
  readonly token: MachineTokenView;
  readonly pending: PendingAct;
  readonly busy: boolean;
  readonly onAsk: (act: Exclude<PendingAct, null>) => void;
  readonly onCancel: () => void;
  readonly onConfirm: (act: Exclude<PendingAct, null>) => void;
}

/**
 * One credential, and the two things that can be done to it.
 *
 * Presentational to the bone: it is handed a token and some callbacks, and it
 * knows nothing about requests, caches or which of these is in flight.
 *
 * ## Why the confirmation is inline rather than a second sheet
 *
 * Because this row is already inside one. A sheet opened from inside a sheet
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

  const when = (moment: string): string =>
    new Date(moment).toLocaleDateString(language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <li className="machine-token">
      <div className="machine-token__head">
        <span className="machine-token__name">{token.name}</span>
        <span className="machine-token__scope">
          {token.scope === MachineTokenScope.ReadWrite
            ? t("tokens.scopeReadWrite")
            : t("tokens.scopeRead")}
        </span>
      </div>

      <p className="machine-token__facts">
        {/*
          `lastUsedAt` first, because it is the column somebody came for: a
          credential nobody can see being used is one nobody will ever revoke.
        */}
        <span>
          {token.lastUsedAt === null
            ? t("tokens.neverUsed")
            : t("tokens.lastUsedOn", { when: when(token.lastUsedAt) })}
        </span>
        <span>{t("tokens.createdOn", { when: when(token.createdAt) })}</span>
        <span>
          {token.expiresAt === null
            ? t("tokens.neverLapses")
            : t("tokens.lapsesOn", { when: when(token.expiresAt) })}
        </span>
      </p>

      {pending === null ? (
        <div className="machine-token__actions">
          <Button
            tone="secondary"
            icon="rotate"
            onClick={() => {
              onAsk("rotate");
            }}
          >
            {t("tokens.rotateAction")}
          </Button>
          <Button
            tone="danger"
            onClick={() => {
              onAsk("revoke");
            }}
          >
            {t("tokens.revokeAction")}
          </Button>
        </div>
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
          <div className="machine-token__actions">
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
