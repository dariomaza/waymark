import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { CopyableValue } from "../../ui/molecules/copyable-value.js";
import { useTranslate } from "../../app/language-context.js";
import "./issued-secret.css";

export interface TemporaryPasswordProps {
  /** Whose password it is, so the panel can name them. */
  readonly username: string;
  /** The only copy that will ever exist. */
  readonly password: string;
  readonly onDismiss: () => void;
}

/**
 * # A temporary password, shown the one time it can be (ADR 26, amended)
 *
 * The server generated it after adding a person or resetting a password and
 * kept only a hash. It is the same kind of thing a machine token's secret is,
 * and gets the same treatment as `IssuedSecret` (ADR 18, "A secret in a
 * browser"): the warning, the password, the copy button and the way out are
 * one panel, the warning before the way out; it lives in the parent's state
 * and goes with it, and is never cached, stored, logged or put in a URL.
 *
 * Presentational: it is handed the password and one callback.
 */
export const TemporaryPassword = ({
  username,
  password,
  onDismiss,
}: TemporaryPasswordProps): JSX.Element => {
  const t = useTranslate();

  return (
    <div className="issued-secret" role="alert">
      <p className="issued-secret__title">{t("people.temporaryTitle", { username })}</p>
      <p className="issued-secret__warning">{t("people.temporaryOnce", { username })}</p>

      <CopyableValue
        value={password}
        valueLabel={t("people.temporaryLabel", { username })}
        copyLabel={t("tokens.copyAction")}
        copiedLabel={t("tokens.copied")}
        failedLabel={t("tokens.copyFailed")}
      />

      <div className="issued-secret__actions">
        <Button tone="secondary" onClick={onDismiss}>
          {t("people.temporaryDone")}
        </Button>
      </div>
    </div>
  );
};
