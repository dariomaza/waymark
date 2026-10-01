import type { JSX } from "react";

import { CopyableValue } from "../../ui/molecules/copyable-value.js";
import { SettingsItem } from "../../ui/molecules/settings-item.js";
import { useTranslate } from "../../app/language-context.js";

export interface ApiAddressProps {
  /** Where this phone is talking to, already resolved. */
  readonly endpoint: string;
}

/**
 * # The other half of a credential, and the half that keeps
 *
 * A machine token answers "what do I present"; this answers "where do I
 * present it". It is the first row of the list rather than a part of the
 * panel that appears once, because it is not a secret: it can be copied as
 * often as anybody likes, and it is still true a year later — which is the
 * moment somebody comes back to rotate a credential.
 *
 * ## One row: a link, the address, and its copy control
 *
 * It had a title and a note of its own. The picture says what the row is, the
 * value is named for a screen reader, and the note is behind the group's ⓘ.
 * The browser draws the same row.
 */
export const ApiAddress = ({ endpoint }: ApiAddressProps): JSX.Element => {
  const t = useTranslate();

  return (
    <SettingsItem icon="link">
      <CopyableValue
        plain
        oneLine
        value={endpoint}
        valueLabel={t("tokens.addressLabel", { address: endpoint })}
        copyLabel={t("tokens.addressCopy")}
        copiedLabel={t("tokens.addressCopied")}
        failedLabel={t("tokens.copyFailedPhone")}
      />
    </SettingsItem>
  );
};
