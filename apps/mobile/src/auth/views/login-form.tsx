import type { Credentials } from "@waymark/api-client";
import { useState, type JSX, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { PasswordField } from "../../ui/atoms/password-field.js";
import { ScreenTitle } from "../../ui/atoms/screen-title.js";
import { TextField } from "../../ui/atoms/text-field.js";
import { colors, space, text } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface LoginFormProps {
  readonly onSubmit: (credentials: Credentials) => void;
  readonly busy: boolean;
  /** Already turned into a sentence; this component decides nothing. */
  readonly failure: string | null;
  /**
   * The other way in, when there is one.
   *
   * Handed in rather than decided here, because whether a fingerprint can open
   * anything on this phone is a fact about the keystore and this component
   * knows what a session is as little as it knows what a client is. It sits
   * BELOW the password, which is the order of the two doors: the one that
   * always works is the one that is always first.
   */
  readonly biometrics?: ReactNode;
}

/**
 * Presentational. It holds what has been typed and hands it back on submit,
 * and that is the whole of it: no client, no navigation, no idea what a
 * session is.
 */
export const LoginForm = ({
  onSubmit,
  busy,
  failure,
  biometrics,
}: LoginFormProps): JSX.Element => {
  const t = useTranslate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (): void => {
    onSubmit({ username, password });
  };

  return (
    <View style={styles.form}>
      <ScreenTitle>{t("login.title")}</ScreenTitle>
      <Text style={styles.tagline}>{t("login.tagline")}</Text>
      <Text style={styles.lede}>
        {t("login.note")}
      </Text>

      {failure === null ? null : <Callout tone="wrong">{failure}</Callout>}

      <TextField
        label={t("login.username")}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        returnKeyType="next"
      />

      <PasswordField
        label={t("login.password")}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />

      <Button tone="primary" block disabled={busy} onPress={submit} label={t("login.submit")}>
        {busy ? t("login.submitting") : t("login.submit")}
      </Button>

      {biometrics}
    </View>
  );
};

const styles = StyleSheet.create({
  form: { gap: space.s4 },
  // The tagline sits under the title and above the practical note, so it
  // reads as part of the heading rather than as the first instruction.
  tagline: { color: colors.accentText, fontSize: text.m, marginTop: -space.s3 },
  lede: { color: colors.inkMuted, fontSize: text.s },
});
