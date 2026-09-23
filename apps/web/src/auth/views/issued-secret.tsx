import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { CopyableValue } from "../../ui/molecules/copyable-value.js";
import { useTranslate } from "../../app/language-context.js";
import { mcpSettings } from "../mcp-settings.js";
import "./issued-secret.css";

export interface IssuedSecretProps {
  /** The token the credential belongs to, so the panel can name it. */
  readonly name: string;
  /** The only copy that will ever exist. */
  readonly secret: string;
  /** Where the credential is presented. Not a secret, and not treated as one. */
  readonly endpoint: string;
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
 * Everything added to help somebody USE the credential sits below that
 * dismiss button, and nothing was added above the warning. A block that made
 * this panel more useful at the cost of pushing the warning down the screen
 * would be a worse panel than one with no help in it at all — the warning is
 * the only thing between somebody and a credential they cannot get back.
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
 * The pair below carries the same secret, so it has exactly the same
 * lifetime: it is assembled while rendering, from props, and there is no
 * moment at which it exists anywhere the secret itself does not. The ADDRESS
 * is the opposite kind of thing and is drawn separately, on the list, where
 * it keeps working after this panel is gone.
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
  endpoint,
  onDismiss,
}: IssuedSecretProps): JSX.Element => {
  const t = useTranslate();

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
        The secret and the control that takes it are one block, so the control
        cannot end up anywhere but beside the string it is about — which is
        where it was NOT, before: a full-width button below the warning, the
        secret and the note, in the accent tone, as loud as signing in.
      */}
      <CopyableValue
        value={secret}
        valueLabel={t("tokens.secretLabel", { name })}
        copyLabel={t("tokens.copyAction")}
        copiedLabel={t("tokens.copied")}
        failedLabel={t("tokens.copyFailed")}
      />

      {/*
        What the credential is FOR, and the scheme it travels under. `Machine`
        is its own scheme (ADR 17) and the mistake anybody makes at one in the
        morning is `Bearer` — which fails as a 401 that looks exactly like a
        bad credential, so nobody suspects the header.
      */}
      <p className="issued-secret__how">{t("tokens.secretHow")}</p>

      {/*
        One button here now, and it is the one that takes the panel away.
        "I have stored it" keeps its words for the reason every rare and
        irreversible act in this app does: there is no shape that means it,
        and an icon somebody has to learn by pressing it is worse than a
        sentence somebody reads once.
      */}
      <div className="issued-secret__actions">
        <Button tone="secondary" onClick={onDismiss}>
          {t("tokens.storedAction")}
        </Button>
      </div>

      {/*
        Below the dismiss button on purpose. Somebody who only wants the secret
        has already been served by everything above this line; somebody who is
        about to go and configure the MCP server saves retyping both halves.
      */}
      <div className="issued-secret__pair">
        <p className="issued-secret__pair-note">{t("tokens.pairNote")}</p>
        <CopyableValue
          className="issued-secret__pair-value"
          value={mcpSettings(endpoint, secret)}
          valueLabel={t("tokens.pairLabel", { name })}
          copyLabel={t("tokens.pairCopy")}
          copiedLabel={t("tokens.pairCopied")}
          failedLabel={t("tokens.copyFailed")}
        />
      </div>
    </div>
  );
};
