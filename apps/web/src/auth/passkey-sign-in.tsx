import { describeFailure, passkeyFailureMessage } from "@waymark/i18n";
import type { JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { useTranslate } from "../app/language-context.js";
import { PasskeyCancelled } from "./passkey-platform.js";
import { usePasskeySignIn, usePasskeySupport } from "./passkey-queries.js";
import { sessionStore } from "./session-store.js";
import "./passkey-sign-in.css";

/**
 * # The other door, and it is never the only one
 *
 * ADR 19's rule, rendered: the password form above this is complete, always
 * present, and never behind a "use password instead" link. This is an
 * ADDITION under it.
 *
 * ## Why the hierarchy is what it is
 *
 * Three controls compete for attention on this screen and only one of them
 * may be loud.
 *
 * 1. **Sign in** is `primary` and full width. It is the thing this screen is
 *    for, and it works on every device, every time, with a wet thumb.
 * 2. **This button** is `secondary` and full width, under a rule with the word
 *    "or" in it. Plainly available, plainly an alternative, and visibly not
 *    the same weight as the one above it.
 * 3. **Showing the password** is an icon inside the field. It is a control
 *    ON a field rather than a peer of these two, and drawing it as a
 *    full-width button said that looking at your password mattered as much as
 *    signing in.
 *
 * ## It appears only when it would work
 *
 * `usePasskeySupport` asks the platform whether there is an authenticator at
 * all. While that is pending, and whenever it says no, this renders NOTHING —
 * not a disabled button and not an explanation. A control that cannot work is
 * worse than no control, and a browser without WebAuthn has a perfectly good
 * password form two inches above.
 *
 * ## A cancelled prompt is not a failure
 *
 * Somebody who dismisses the dialog gets a `note`, not an alert, and the form
 * is untouched. There is no retry, no second prompt and nothing that reopens
 * itself: a cut finger, a wet thumb or a change of mind has to land somewhere
 * calm, because the alternative is an app that nags at the one moment a person
 * is already annoyed.
 */
export const PasskeySignIn = (): JSX.Element | null => {
  const t = useTranslate();

  const support = usePasskeySupport();
  const signIn = usePasskeySignIn();

  if (support.data !== true) {
    return null;
  }

  const cancelled = signIn.error instanceof PasskeyCancelled;

  return (
    <div className="passkey-sign-in">
      <p className="passkey-sign-in__or">{t("login.or")}</p>

      <Button
        tone="secondary"
        block
        disabled={signIn.isPending}
        onClick={() => {
          signIn.mutate(undefined, {
            onSuccess: (session) => {
              // The same store a password's session goes into, because it is
              // the same session (ADR 6). `LoginScreen` is watching it and
              // navigates to wherever the person was going.
              sessionStore.save(session);
            },
          });
        }}
      >
        {signIn.isPending ? t("passkeys.signingIn") : t("passkeys.signInAction")}
      </Button>

      {signIn.error === null ? null : cancelled ? (
        <Callout tone="note">
          <p>{t("passkeys.cancelled")}</p>
        </Callout>
      ) : (
        <Callout tone="wrong">
          <p>
            {t(passkeyFailureMessage(signIn.error) ?? describeFailure(signIn.error))}
          </p>
        </Callout>
      )}
    </div>
  );
};
