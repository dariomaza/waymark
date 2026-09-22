import type { Credentials } from "@waymark/api-client";
import { useState, type FormEvent, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { TextField } from "../ui/atoms/text-field.js";
import { useTranslate } from "../app/language-context.js";

export interface LoginFormProps {
  readonly onSubmit: (credentials: Credentials) => void;
  readonly busy: boolean;
  /** Already turned into a sentence; this component decides nothing. */
  readonly failure: string | null;
}

/**
 * Presentational. It holds what has been typed and hands it back on submit,
 * and that is the whole of it: no client, no navigation, no idea what a
 * session is. Which is why its test is a render and two `type` calls.
 */
export const LoginForm = ({ onSubmit, busy, failure }: LoginFormProps): JSX.Element => {
  const t = useTranslate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit({ username, password });
  };

  return (
    <form className="login" onSubmit={submit} noValidate>
      <h1>{t("login.title")}</h1>
      <p className="login__tagline">{t("login.tagline")}</p>
      <p className="login__lede">
        {t("login.note")}
      </p>

      {failure === null ? null : <Callout tone="wrong">{failure}</Callout>}

      <TextField
        id="username"
        label={t("login.username")}
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={username}
        onChange={(event) => {
          setUsername(event.target.value);
        }}
      />

      <TextField
        id="password"
        label={t("login.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />

      <Button type="submit" tone="primary" block disabled={busy}>
        {busy ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
};
