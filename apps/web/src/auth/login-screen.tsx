import { loginFailureMessage } from "@waymark/i18n";
import type { JSX } from "react";
import { Navigate, useLocation } from "react-router-dom";

import "./login-screen.css";

import { LoginForm } from "./login-form.js";
import { PasskeySignIn } from "./passkey-sign-in.js";
import { useSession, useSignIn } from "./use-session.js";
import { useTranslate } from "../app/language-context.js";

/**
 * Container. It owns the session, the navigation and the failure, and hands
 * the form three props.
 *
 * `state.from` is where the person was going before they were sent here — a
 * scanned box, usually. Landing them on the home screen instead would be the
 * app forgetting what they asked for, which for the flagship feature of this
 * product is the difference between working and feeling broken.
 */
export const LoginScreen = (): JSX.Element => {
  const t = useTranslate();

  const session = useSession();
  const location = useLocation();
  const signIn = useSignIn();

  const intended = intendedDestination(location.state);

  if (session !== null) {
    return <Navigate to={intended} replace />;
  }

  return (
    <main className="login-screen">
      {/*
        The order on this screen is the decision, not an accident (ADR 19).
        The password form comes first and is complete; the passkey is under
        it, past a rule with "or" in it, in a quieter tone. It is an
        ADDITIONAL door, so it is drawn as one — and it draws nothing at all
        on a device that cannot serve it.
      */}
      <div className="login-screen__card">
        <LoginForm
          onSubmit={(credentials) => {
            signIn.mutate(credentials);
          }}
          busy={signIn.isPending}
          failure={t(loginFailureMessage(signIn.error))}
        />
        <PasskeySignIn />
      </div>
    </main>
  );
};

/** Only ever a path inside this app; never something a URL could smuggle in. */
const intendedDestination = (state: unknown): string => {
  if (typeof state === "object" && state !== null && "from" in state) {
    const from = (state as { from?: unknown }).from;
    if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
      return from;
    }
  }

  return "/";
};
