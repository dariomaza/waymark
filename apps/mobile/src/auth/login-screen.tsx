import { loginFailureMessage } from "@waymark/i18n";
import { useEffect, useRef, type JSX } from "react";

import { useTranslate } from "../app/language-context.js";
import { Button } from "../ui/atoms/button.js";
import { Screen } from "../ui/organisms/screen.js";
import { useSessionState, useSignIn, useUnlockSealedSession } from "./use-session.js";
import { LoginForm } from "./views/login-form.js";

/**
 * Container. It owns the session and the failure, and hands the form its
 * props.
 *
 * There is no "where were you going" to carry, unlike the web client's. A
 * scanned label opens this app through a deep link the operating system hands
 * over at launch, and the navigator is not mounted until there is a session —
 * so signing in reads the launch URL and lands on that box, rather than
 * remembering a destination across a redirect.
 *
 * # Two doors, and only one of them is always there
 *
 * The password form is drawn every time and is never behind a link. The
 * fingerprint is an ALTERNATIVE way in, offered only when it can actually work
 * — there is a sealed session on this phone AND this phone can open one — and
 * a button that fails the moment it is pressed is worse than no button.
 *
 * When it can work it opens by itself, because a screen that knows it could
 * let somebody in and makes them ask first is being coy for no reason.
 */
export const LoginScreen = (): JSX.Element => {
  const signIn = useSignIn();
  const unlock = useUnlockSealedSession();
  const state = useSessionState();
  const t = useTranslate();

  const sealed = state.status === "known" && state.sealed;

  /**
   * Asked once, on arrival, and never again by itself.
   *
   * A ref and not state: it must not cause a render, and it must survive the
   * one this effect's own mutation causes. An auto-opening dialog that reopens
   * when you dismiss it is a trap, and it is the single most likely way to
   * make this feature hated — so a cancelled prompt ends here, in front of a
   * password form that works. Pressing the button is what asks again, because
   * pressing it is somebody asking.
   */
  const asked = useRef(false);

  useEffect(() => {
    if (!sealed || asked.current) {
      return;
    }

    asked.current = true;
    unlock.mutate();
    // `unlock` is a fresh object every render; the guard above is what makes
    // this run once, so depending on it would only re-run an effect that does
    // nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sealed]);

  return (
    <Screen>
      <LoginForm
        onSubmit={(credentials) => {
          signIn.mutate(credentials);
        }}
        busy={signIn.isPending}
        failure={t(loginFailureMessage(signIn.error))}
        biometrics={
          sealed ? (
            <Button
              tone="secondary"
              block
              disabled={unlock.isPending}
              label={t("login.withBiometrics")}
              onPress={() => {
                unlock.mutate();
              }}
            >
              {t("login.withBiometrics")}
            </Button>
          ) : null
        }
      />
    </Screen>
  );
};
