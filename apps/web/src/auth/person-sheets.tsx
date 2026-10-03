import type { AccountView } from "@waymark/api-client";
import { accountFailureMessage, describeFailure } from "@waymark/i18n";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useTranslate } from "../app/language-context.js";
import { useDisableAccount, useResetAccountPassword } from "./people-queries.js";
import { TemporaryPassword } from "./views/temporary-password.js";

/**
 * # The two questions the People group asks before it acts (ADR 26)
 *
 * Disabling somebody and resetting their password both take something away
 * from a person who is not in the room: every session they have, and with a
 * disable every machine token they issued. So each is a sheet that says the
 * consequence before the button does it. The way out is the sheet's own X,
 * as on every sheet in this client.
 */
export interface PersonSheetProps {
  readonly account: AccountView;
  readonly onClose: () => void;
}

/**
 * A new temporary password for somebody else, and the consequence said before
 * the button: they are signed out everywhere. Their passkeys and machine
 * tokens keep working (ADR 19), and the sheet says that too. Once it is done,
 * the sheet shows the password the server made, once, in its own state, and
 * closes when it is dismissed (ADR 26, amended).
 */
export const ResetPasswordSheet = ({ account, onClose }: PersonSheetProps): JSX.Element => {
  const t = useTranslate();
  const reset = useResetAccountPassword();
  const [issued, setIssued] = useState<string | null>(null);

  return (
    <Sheet title={t("people.resetTitle", { username: account.username })} onClose={onClose}>
      {issued === null ? (
        <>
          <p>{t("people.resetWarning", { username: account.username })}</p>
          {reset.isError ? (
            <Callout tone="wrong">
              <p>{t(accountFailureMessage(reset.error) ?? describeFailure(reset.error))}</p>
            </Callout>
          ) : null}
          <div className="sheet__commit">
            <Button
              tone="primary"
              disabled={reset.isPending}
              onClick={() => {
                reset.mutate(account.id, {
                  onSuccess: (answer) => {
                    setIssued(answer.temporaryPassword);
                  },
                });
              }}
            >
              {reset.isPending ? t("people.resetting") : t("people.resetConfirm")}
            </Button>
          </div>
        </>
      ) : (
        <TemporaryPassword username={account.username} password={issued} onDismiss={onClose} />
      )}
    </Sheet>
  );
};

/** Disabling, asked first, saying what it does and what it keeps. */
export const DisablePersonSheet = ({ account, onClose }: PersonSheetProps): JSX.Element => {
  const t = useTranslate();
  const disable = useDisableAccount();

  return (
    <Sheet title={t("people.disableTitle", { username: account.username })} onClose={onClose}>
      <p>{t("people.disableWarning", { username: account.username })}</p>
      {disable.isError ? (
        <Callout tone="wrong">
          <p>{t(accountFailureMessage(disable.error) ?? describeFailure(disable.error))}</p>
        </Callout>
      ) : null}
      <div className="sheet__commit">
        <Button
          tone="danger"
          disabled={disable.isPending}
          onClick={() => {
            disable.mutate(account.id, { onSuccess: onClose });
          }}
        >
          {disable.isPending ? t("people.disabling") : t("people.disableConfirm")}
        </Button>
      </div>
    </Sheet>
  );
};
