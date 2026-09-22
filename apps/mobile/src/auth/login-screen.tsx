import { loginFailureMessage } from "@waymark/i18n";
import type { JSX } from "react";

import { useTranslate } from "../app/language-context.js";
import { Screen } from "../ui/organisms/screen.js";
import { useSignIn } from "./use-session.js";
import { LoginForm } from "./views/login-form.js";

/**
 * Container. It owns the session and the failure, and hands the form three
 * props.
 *
 * There is no "where were you going" to carry, unlike the web client's. A
 * scanned label opens this app through a deep link the operating system hands
 * over at launch, and the navigator is not mounted until there is a session —
 * so signing in reads the launch URL and lands on that box, rather than
 * remembering a destination across a redirect.
 */
export const LoginScreen = (): JSX.Element => {
  const signIn = useSignIn();
  const t = useTranslate();

  return (
    <Screen>
      <LoginForm
        onSubmit={(credentials) => {
          signIn.mutate(credentials);
        }}
        busy={signIn.isPending}
        failure={t(loginFailureMessage(signIn.error))}
      />
    </Screen>
  );
};
