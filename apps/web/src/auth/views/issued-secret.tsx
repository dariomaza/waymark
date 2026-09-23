import { useState, type JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { useTranslate } from "../../app/language-context.js";
import "./issued-secret.css";

export interface IssuedSecretProps {
  /** The token the credential belongs to, so the panel can name it. */
  readonly name: string;
  /** The only copy that will ever exist. */
  readonly secret: string;
  readonly onDismiss: () => void;
}

/**
 * # The only time this string exists anywhere but in somebody's hands
 *
 * The server kept a SHA-256 and cannot produce the secret again. That is the
 * property rather than a limitation, and it is the reason this component is
 * shaped the way it is.
 *
 * ## The warning comes first, inside the same panel as the way out
 *
 * A sentence that appears after the only copy is gone is an epitaph. So the
 * "you will not see this again" text, the secret, the copy button and the
 * dismiss button are one panel: nobody can reach the control that takes it
 * away without having passed the sentence that says what that means.
 *
 * ## What a secret in a browser actually is, and what this cannot do about it
 *
 * Honestly: it is in the DOM, so any XSS on this origin reads it. It is in a
 * screenshot, which on a phone syncs to a photo library. It is in a screen
 * recording, and in whatever a shared screen was pointed at. If it is copied,
 * it is in an OS-level clipboard history that some launchers keep. None of
 * those are things this file can prevent, and pretending otherwise in a
 * comment would be worse than writing it down.
 *
 * What it does do is not make any of it worse:
 *
 * - it is never cached (the response is a `POST`, and ADR 13 caches no write);
 * - it is never written to storage — it lives in the parent's state and goes
 *   with the sheet;
 * - it is not logged, not in a URL, and not in a query key.
 *
 * ## Why copying is offered rather than withheld
 *
 * The alternative is somebody transcribing 43 random base64url characters by
 * eye, getting one wrong, and reaching for a screenshot — which is a permanent
 * file in a photo library that syncs, rather than a clipboard entry the next
 * copy replaces. This is harm reduction and it is a choice, not an oversight.
 *
 * ## Why there is no reveal toggle
 *
 * A secret that has to be revealed to be used gets revealed. What a toggle
 * actually buys is a moment of theatre, and what it costs is that somebody
 * reveals it while screen-sharing to ask why it is not working. The real
 * defence is that this credential can be rotated and revoked by the person
 * reading this panel, which is what the rest of this feature exists for.
 */
export const IssuedSecret = ({
  name,
  secret,
  onDismiss,
}: IssuedSecretProps): JSX.Element => {
  const t = useTranslate();
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    /**
     * `role="alert"`, because this interrupts. It is the one thing on the
     * screen that has to be read before anything else is done, and a screen
     * reader that announced it only when somebody happened to tab into it
     * would announce it too late.
     */
    <div className="issued-secret" role="alert">
      <p className="issued-secret__title">{t("tokens.secretTitle")}</p>
      <p className="issued-secret__warning">{t("tokens.secretOnce")}</p>

      {/*
        A `<code>` in a block that wraps rather than scrolls sideways: a
        credential with its last eight characters off the right-hand edge of a
        phone is one somebody copies wrongly by hand.
      */}
      <code className="issued-secret__value" aria-label={t("tokens.secretLabel", { name })}>
        {secret}
      </code>

      <p className="issued-secret__how">{t("tokens.secretHow")}</p>

      <div className="issued-secret__actions">
        <Button
          tone="primary"
          onClick={() => {
            void copy(secret).then(setCopied);
          }}
        >
          {copied === true ? t("tokens.copied") : t("tokens.copyAction")}
        </Button>
        <Button tone="secondary" onClick={onDismiss}>
          {t("tokens.storedAction")}
        </Button>
      </div>

      {copied === false ? (
        <p className="issued-secret__copy-failed">{t("tokens.copyFailed")}</p>
      ) : null}
    </div>
  );
};

/**
 * `navigator.clipboard` is absent over plain HTTP and can be refused outright
 * by a permissions policy, so the failure is a normal outcome rather than an
 * exception to let through. Saying "copy it by hand" is a worse experience and
 * a true sentence; a button that silently did nothing would be neither.
 */
const copy = async (value: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(value);

    return true;
  } catch {
    return false;
  }
};
