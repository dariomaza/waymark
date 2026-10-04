import type { AccountView } from "@waymark/api-client";
import { accountFailureMessage, describeFailure } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslate } from "../app/language-context.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { space, text } from "../ui/styles/tokens.js";
import { themed } from "../ui/styles/theme.js";
import { useDisableAccount, useResetAccountPassword } from "./people-queries.js";
import { TemporaryPassword } from "./views/temporary-password.js";

/**
 * # The two questions the People group asks before it acts (ADR 26)
 *
 * Disabling somebody and resetting their password both take something away
 * from a person who is not in the room: every session they have, and with a
 * disable every machine token they issued. So each is a sheet that says the
 * consequence before the button does it, with one full-width primary and the
 * sheet's X as the way out, as on every sheet here. The browser asks the same
 * two questions.
 */
export interface PersonSheetProps {
  readonly account: AccountView;
  readonly onClose: () => void;
}

/**
 * A new temporary password for somebody else, and the consequence said before
 * the button: they are signed out everywhere. Once it is done, the sheet shows
 * the password the server made, once, in its own state, and closes when it is
 * dismissed (ADR 26, amended).
 */
export const ResetPasswordSheet = ({ account, onClose }: PersonSheetProps): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();
  const reset = useResetAccountPassword();
  const [issued, setIssued] = useState<string | null>(null);

  return (
    <Sheet title={t("people.resetTitle", { username: account.username })} onClose={onClose}>
      {issued === null ? (
        <View style={styles.block}>
          <Text style={styles.text}>
            {t("people.resetWarning", { username: account.username })}
          </Text>
          {reset.isError ? (
            <Callout tone="wrong">
              {t(accountFailureMessage(reset.error) ?? describeFailure(reset.error))}
            </Callout>
          ) : null}
          <Button
            tone="primary"
            block
            disabled={reset.isPending}
            label={t("people.resetConfirm")}
            onPress={() => {
              reset.mutate(account.id, {
                onSuccess: (answer) => {
                  setIssued(answer.temporaryPassword);
                  // Let go of the answer, so the mutation (gcTime 0) is
                  // forgotten now rather than when the sheet closes.
                  reset.reset();
                },
              });
            }}
          >
            {reset.isPending ? t("people.resetting") : t("people.resetConfirm")}
          </Button>
        </View>
      ) : (
        <TemporaryPassword username={account.username} password={issued} onDismiss={onClose} />
      )}
    </Sheet>
  );
};

export const DisablePersonSheet = ({ account, onClose }: PersonSheetProps): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();
  const disable = useDisableAccount();

  return (
    <Sheet title={t("people.disableTitle", { username: account.username })} onClose={onClose}>
      <View style={styles.block}>
        <Text style={styles.text}>
          {t("people.disableWarning", { username: account.username })}
        </Text>
        {disable.isError ? (
          <Callout tone="wrong">
            {t(accountFailureMessage(disable.error) ?? describeFailure(disable.error))}
          </Callout>
        ) : null}
        <Button
          tone="danger"
          block
          disabled={disable.isPending}
          label={t("people.disableConfirm")}
          onPress={() => {
            disable.mutate(account.id, { onSuccess: onClose });
          }}
        >
          {disable.isPending ? t("people.disabling") : t("people.disableConfirm")}
        </Button>
      </View>
    </Sheet>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    block: { gap: space.s3 },
    text: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
  }),
);
