import { describeFailure, passwordChangeFailureMessage } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslate } from "../app/language-context.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { PasswordField } from "../ui/atoms/password-field.js";
import { ScreenTitle } from "../ui/atoms/screen-title.js";
import { Screen } from "../ui/organisms/screen.js";
import { space, text } from "../ui/styles/tokens.js";
import { themed } from "../ui/styles/theme.js";
import { useChangeOwnPassword } from "./password-queries.js";
import { useSignOut } from "./use-session.js";

/**
 * # Choose your password: the only screen a temporary password opens
 *
 * The session gate draws this instead of the app while `/auth/me` says
 * `mustChangePassword` (ADR 26, amended): every other route would answer 403
 * `PASSWORD_CHANGE_REQUIRED`, so there is nothing else worth drawing. The
 * browser draws the same screen.
 *
 * Shaped like the sign-in screen, because it is the last step of signing in.
 * One field with the reveal the sign-in form has (seeing it is the check, so
 * there is no second field to compare), one primary action, and a quiet way
 * out. The current password is NOT asked for, and not sent: a flagged account
 * changes without it, and the person has just typed the temporary one.
 */
export const ChoosePasswordScreen = (): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();
  const change = useChangeOwnPassword();
  const signOut = useSignOut();
  const [password, setPassword] = useState("");

  const submit = (): void => {
    change.mutate({ password });
  };

  return (
    <Screen>
      <View style={styles.form}>
        <ScreenTitle>{t("password.chooseTitle")}</ScreenTitle>
        <Text style={styles.lede}>{t("password.chooseLede")}</Text>

        {change.isError ? (
          <Callout tone="wrong">
            {t(
              passwordChangeFailureMessage(change.error) ??
                describeFailure(change.error),
            )}
          </Callout>
        ) : null}

        <PasswordField
          label={t("password.newLabel")}
          hint={t("password.newHint")}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />

        <Button
          tone="primary"
          block
          disabled={change.isPending}
          label={t("password.chooseAction")}
          onPress={submit}
        >
          {change.isPending ? t("password.saving") : t("password.chooseAction")}
        </Button>
        <Button
          tone="quiet"
          block
          disabled={signOut.isPending}
          label={t("shell.signOut")}
          onPress={() => {
            signOut.mutate();
          }}
        >
          {t("shell.signOut")}
        </Button>
      </View>
    </Screen>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    form: { gap: space.s4 },
    lede: { color: colors.inkMuted, fontSize: text.s },
  }),
);
