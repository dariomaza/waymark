import { describeFailure, passwordChangeFailureMessage } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import { useTranslate } from "../app/language-context.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { PasswordField } from "../ui/atoms/password-field.js";
import { SettingsGroup } from "../ui/molecules/settings-group.js";
import { space } from "../ui/styles/tokens.js";
import { useChangeOwnPassword } from "./password-queries.js";

/**
 * # Password: changing your own, from the account screen (ADR 26, amended)
 *
 * The phone's half of `apps/web/src/auth/password-panel.tsx`, and the same
 * group: between Preferences and Security, because it is about the person.
 * The button opens the form; the form asks for the current password first,
 * then the new one. The API keeps this session and ends the others.
 *
 * A wrong current password is a 401 `INVALID_CREDENTIALS`, which the client
 * does not treat as a session ending (the session that sent it is fine): it
 * is said here, in the group, and the person stays signed in.
 *
 * A person holding a temporary password never reaches this screen — the
 * session gate shows them the screen that chooses one, which sends no
 * current password. This one always does.
 */
export const PasswordPanel = (): JSX.Element => {
  const t = useTranslate();
  const change = useChangeOwnPassword();

  const [composing, setComposing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const close = (): void => {
    setComposing(false);
    setCurrent("");
    setNext("");
  };

  const submit = (): void => {
    change.mutate({ password: next, currentPassword: current }, { onSuccess: close });
  };

  const title = t("password.group");

  return (
    <SettingsGroup
      title={title}
      about={[t("password.explains")]}
      aboutLabel={t("account.moreAbout", { group: title })}
      notes={
        change.isError ? (
          <Callout tone="wrong">
            {t(passwordChangeFailureMessage(change.error) ?? describeFailure(change.error))}
          </Callout>
        ) : change.isSuccess && !composing ? (
          <Callout tone="note">{t("password.changed")}</Callout>
        ) : null
      }
    >
      {composing ? (
        <View style={styles.block}>
          <PasswordField
            label={t("password.currentLabel")}
            value={current}
            onChangeText={setCurrent}
          />
          <PasswordField
            label={t("password.newLabel")}
            hint={t("password.newHint")}
            value={next}
            onChangeText={setNext}
            onSubmitEditing={submit}
          />
          <View style={styles.actions}>
            <Button
              tone="primary"
              disabled={change.isPending}
              label={t("password.changeConfirm")}
              onPress={submit}
            >
              {change.isPending ? t("password.saving") : t("password.changeConfirm")}
            </Button>
            <Button
              tone="quiet"
              disabled={change.isPending}
              label={t("action.cancel")}
              onPress={() => {
                close();
                change.reset();
              }}
            >
              {t("action.cancel")}
            </Button>
          </View>
        </View>
      ) : (
        <View style={styles.block}>
          <Button
            tone="secondary"
            icon="key"
            label={t("password.changeAction")}
            onPress={() => {
              change.reset();
              setComposing(true);
            }}
          >
            {t("password.changeAction")}
          </Button>
        </View>
      )}
    </SettingsGroup>
  );
};

// Nothing here is a colour, so nothing here waits for the scheme on screen.
const styles = StyleSheet.create({
  // Anything in the card that is not a row of its own gets the rows' inset.
  block: {
    gap: space.s3,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    alignItems: "flex-start",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
});
