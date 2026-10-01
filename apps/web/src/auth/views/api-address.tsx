import type { JSX } from "react";

import { Icon } from "../../ui/atoms/icon.js";
import { CopyableValue } from "../../ui/molecules/copyable-value.js";
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
 * ## It is the first row of the list, not only on the panel that appears once
 *
 * The secret is shown once and is then gone for ever. The address is not a
 * secret at all: it can be re-read, cached and copied as often as anybody
 * likes, and it is still true a year later. Putting it only beside the secret
 * would have tied a permanent fact to a panel with a five-second lifetime.
 *
 * ## One row: a link, the address, and its copy control
 *
 * It had a title and a note of its own. The picture says what the row is, the
 * value is named for a screen reader, and the note is behind the group's ⓘ
 * with the rest of the group's explanation.
 */
export const ApiAddress = ({ endpoint }: ApiAddressProps): JSX.Element => {
  const t = useTranslate();

  return (
    <div className="settings-item api-address">
      <Icon name="link" size={20} />
      <CopyableValue
        className="api-address__value"
        oneLine
        value={endpoint}
        valueLabel={t("tokens.addressLabel", { address: endpoint })}
        copyLabel={t("tokens.addressCopy")}
        copiedLabel={t("tokens.addressCopied")}
        failedLabel={t("tokens.copyFailed")}
      />
    </div>
  );
};
