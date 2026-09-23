import type { JSX } from "react";

import { CopyButton } from "../../ui/molecules/copy-button.js";
import { useTranslate } from "../../app/language-context.js";
import "./api-address.css";

export interface ApiAddressProps {
  /** Where this browser is talking to, already resolved. */
  readonly endpoint: string;
}

/**
 * # The other half of a credential, and the half that keeps
 *
 * A machine token answers "what do I present"; this answers "where do I
 * present it". Without it somebody who has just made a credential has to go
 * and work out which hostname the thing they are wiring up should call, and
 * the two ways of finding out are a README written for a different
 * installation and a guess.
 *
 * ## It sits on the LIST, not only on the panel that appears once
 *
 * The secret is shown once and is then gone for ever. The address is not a
 * secret at all: it can be re-read, cached and copied as often as anybody
 * likes, and it is still true a year later. Putting it only beside the secret
 * would have tied a permanent fact to a panel with a five-second lifetime,
 * and the moment somebody most needs it — coming back to rotate a credential
 * — is precisely a moment with no issued secret on screen.
 *
 * ## Once, not once per row
 *
 * There is one API and every token on the list is presented to it, so the
 * address belongs to the list rather than to a row. Repeating it under each
 * credential would be the same forty characters printed six times on a phone,
 * which reads as six different addresses at a glance.
 */
export const ApiAddress = ({ endpoint }: ApiAddressProps): JSX.Element => {
  const t = useTranslate();

  return (
    <div className="api-address">
      <p className="api-address__title">{t("tokens.addressTitle")}</p>
      <code className="api-address__value" aria-label={t("tokens.addressLabel")}>
        {endpoint}
      </code>
      <p className="api-address__note">{t("tokens.addressNote")}</p>
      <CopyButton
        value={endpoint}
        tone="quiet"
        label={t("tokens.addressCopy")}
        copiedLabel={t("tokens.addressCopied")}
        failedLabel={t("tokens.copyFailed")}
      />
    </div>
  );
};
