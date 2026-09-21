import type { Credentials } from "@ariadna/api-client";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { ScreenTitle } from "../../ui/atoms/screen-title.js";
import { TextField } from "../../ui/atoms/text-field.js";
import { colors, space, text } from "../../ui/styles/tokens.js";

export interface LoginFormProps {
  readonly onSubmit: (credentials: Credentials) => void;
  readonly busy: boolean;
  /** Already turned into a sentence; this component decides nothing. */
  readonly failure: string | null;
}

/**
 * Presentational. It holds what has been typed and hands it back on submit,
 * and that is the whole of it: no client, no navigation, no idea what a
 * session is.
 */
export const LoginForm = ({ onSubmit, busy, failure }: LoginFormProps): JSX.Element => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (): void => {
    onSubmit({ username, password });
  };

  return (
    <View style={styles.form}>
      <ScreenTitle>Sign in to Ariadna</ScreenTitle>
      <Text style={styles.lede}>
        Accounts are created on the server. There is no sign-up.
      </Text>

      {failure === null ? null : <Callout tone="wrong">{failure}</Callout>}

      <TextField
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        returnKeyType="next"
      />

      <TextField
        label="Password"
        autoComplete="current-password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      <Button tone="primary" block disabled={busy} onPress={submit} label="Sign in">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  form: { gap: space.s4 },
  lede: { color: colors.inkMuted, fontSize: text.s },
});
