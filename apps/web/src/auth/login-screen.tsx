import { loginFailureMessage } from "@ariadna/api-client";
import type { JSX } from "react";
import { Navigate, useLocation } from "react-router-dom";

import "./login-screen.css";

import { LoginForm } from "./login-form.js";
import { useSession, useSignIn } from "./use-session.js";

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
  const session = useSession();
  const location = useLocation();
  const signIn = useSignIn();

  const intended = intendedDestination(location.state);

  if (session !== null) {
    return <Navigate to={intended} replace />;
  }

  return (
    <main className="login-screen">
      <LoginForm
        onSubmit={(credentials) => {
          signIn.mutate(credentials);
        }}
        busy={signIn.isPending}
        failure={loginFailureMessage(signIn.error)}
      />
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
