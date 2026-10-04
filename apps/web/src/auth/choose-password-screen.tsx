import { describeFailure, passwordChangeFailureMessage } from "@waymark/i18n";
import { useState, type FormEvent, type JSX } from "react";

import "./login-screen.css";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { PasswordField } from "../ui/molecules/password-field.js";
import { useTranslate } from "../app/language-context.js";
import { useChangeOwnPassword } from "./password-queries.js";
import { useSignOut } from "./use-session.js";

/**
 * # Choose your password: the only screen a temporary password opens
 *
 * The session gate draws this instead of the app while `/auth/me` says
 * `mustChangePassword` (ADR 26, amended): every other route would answer 403
 * `PASSWORD_CHANGE_REQUIRED`, so there is nothing else worth drawing.
 *
 * Drawn on the sign-in card, because it is the last step of signing in. One
 * field with the reveal the sign-in form has (seeing it is the check, so
 * there is no second field to compare), one primary action, and a quiet way
 * out. The current password is NOT asked for, and not sent: a flagged
 * account changes without it, and the person has just typed the temporary
 * one to get here.
 */
export const ChoosePasswordScreen = (): JSX.Element => {
  const t = useTranslate();
  const change = useChangeOwnPassword();
  const signOut = useSignOut();
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    change.mutate({ password });
  };

  return (
    <main className="login-screen">
      <div className="login-screen__card">
        <form className="login" onSubmit={submit} noValidate>
          <h1>{t("password.chooseTitle")}</h1>
          <p className="login__lede">{t("password.chooseLede")}</p>

          {change.isError ? (
            <Callout tone="wrong">
              {t(passwordChangeFailureMessage(change.error) ?? describeFailure(change.error))}
            </Callout>
          ) : null}

          <PasswordField
            id="new-password"
            label={t("password.newLabel")}
            hint={t("password.newHint")}
            name="new-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />

          <Button type="submit" tone="primary" block disabled={change.isPending}>
            {change.isPending ? t("password.saving") : t("password.chooseAction")}
          </Button>
          <Button
            tone="quiet"
            block
            disabled={signOut.isPending}
            onClick={() => {
              signOut.mutate();
            }}
          >
            {t("shell.signOut")}
          </Button>
        </form>
      </div>
    </main>
  );
};
