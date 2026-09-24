import { useState, type JSX } from "react";

import { useTranslate } from "../app/language-context.js";
import { Toggle } from "../ui/atoms/toggle.js";
import {
  useCanSealSession,
  useSealSession,
  useSessionState,
  useUnsealSession,
} from "./use-session.js";
import { BiometricUnlockSheet } from "./views/biometric-unlock-sheet.js";

/**
 * # The fingerprint, as something you can change your mind about
 *
 * It used to be decided once, silently, at the worst possible moment: signing
 * in raised the system's prompt with no warning, and dismissing it meant this
 * phone never offered a fingerprint again until the next sign-out. The
 * feature was real, worked, and was impossible to find — because there was
 * nothing to find.
 *
 * This is that decision turned into a setting. Underneath it is the same seal
 * (`session-store.ts`): the token behind a Keystore key the OS will not
 * decrypt without a fingerprint, and a readable note beside it so the sign-in
 * screen can offer the door without spending a prompt to discover it exists.
 *
 * ## It draws the phone, not a preference
 *
 * `state.sealed` is whether this phone is HOLDING a sealed session right now,
 * settled from what the keystore actually did. There is deliberately no
 * "biometrics enabled" flag stored anywhere: a preference beside the keystore
 * is a second answer to one question, and the two disagree the first time a
 * seal is refused — which is a switch that says ON above a sign-in screen
 * with no door on it.
 *
 * That is also why a dismissed system prompt needs no error here. The switch
 * simply stays where it was, because that is the truth.
 *
 * ## Nothing at all when the phone cannot do it
 *
 * `canSeal()` is false for a phone with no sensor, a phone with nothing
 * enrolled and a phone with no screen lock — one answer through this API, and
 * the right behaviour is identical for all three. The sign-in screen makes
 * exactly this argument about its button: a control that fails the moment it
 * is touched is worse than a control that was never drawn.
 */
export const BiometricUnlockSetting = (): JSX.Element | null => {
  const t = useTranslate();

  const state = useSessionState();
  const canSeal = useCanSealSession();
  const seal = useSealSession();
  const unseal = useUnsealSession();

  const [asking, setAsking] = useState(false);

  const sealed = state.status === "known" && state.sealed;
  const busy = seal.isPending || unseal.isPending;

  if (!canSeal || state.status !== "known" || state.session === null) {
    return null;
  }

  return (
    <>
      <Toggle
        label={t("biometrics.label")}
        explains={t("biometrics.explains")}
        checked={sealed}
        disabled={busy}
        onPress={() => {
          setAsking(true);
        }}
      />
      {asking ? (
        <BiometricUnlockSheet
          turningOn={!sealed}
          busy={busy}
          onConfirm={() => {
            /*
             * The sheet closes when the keystore has answered, not when the
             * button is pressed. On the sealing side the system's own prompt
             * is on screen for that whole moment, and a sheet that vanished
             * underneath it would leave somebody looking at a fingerprint
             * dialog with no idea what asked for it.
             */
            const act = sealed ? unseal : seal;

            act.mutate(undefined, {
              onSettled: () => {
                setAsking(false);
              },
            });
          }}
          onClose={() => {
            setAsking(false);
          }}
        />
      ) : null}
    </>
  );
};
