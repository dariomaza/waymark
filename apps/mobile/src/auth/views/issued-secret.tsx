import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { CopyableValue } from "../../ui/molecules/copyable-value.js";
import { colors, radius, space, text } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";
import { mcpSettings } from "../mcp-settings.js";

export interface IssuedSecretProps {
  /** The token the credential belongs to, so the panel can name it. */
  readonly name: string;
  /** The only copy that will ever exist. */
  readonly secret: string;
  /** Where the credential is presented. Not a secret, and not treated as one. */
  readonly endpoint: string;
  readonly onDismiss: () => void;
}

/**
 * # The only time this string exists anywhere but in somebody's hands
 *
 * The server kept a SHA-256 and cannot produce the secret again. That is the
 * property rather than a limitation, and it is the reason this component is
 * shaped the way it is.
 *
 * ## The warning comes first, above the way out
 *
 * A sentence that appears after the only copy is gone is an epitaph. So the
 * "you will not see this again" text, the secret, the copy button and the
 * dismiss button are one panel: nobody can reach the control that takes it
 * away without having passed the sentence that says what that means.
 *
 * ## Why copying is offered rather than withheld
 *
 * It matters more here than it does in a browser. The alternative on a phone
 * is somebody transcribing 43 random base64url characters onto a laptop by
 * eye, getting one wrong, and reaching for a SCREENSHOT — which on Android is
 * a permanent file in a library that syncs, rather than a clipboard entry the
 * next copy replaces. This is harm reduction and it is a choice.
 *
 * ## What a secret on a phone actually is, and what this cannot do about it
 *
 * Honestly: it is in this process's memory, so it is in a screenshot and in a
 * screen recording, and once copied it is in whatever clipboard history the
 * launcher keeps. None of those are things this file can prevent. What it
 * does do is not make any of it worse — it is never written to the keystore,
 * never into the query cache, never logged and never in a route parameter. It
 * lives in the panel's parent's state and goes when the screen does.
 *
 * ## Why there is no reveal toggle
 *
 * A secret that has to be revealed to be used gets revealed. The real defence
 * is that this credential can be rotated and revoked by the person reading
 * this panel, which is what the rest of this feature exists for.
 */
export const IssuedSecret = ({
  name,
  secret,
  endpoint,
  onDismiss,
}: IssuedSecretProps): JSX.Element => {
  const t = useTranslate();

  const pair = mcpSettings(endpoint, secret);

  return (
    /*
     * `alert`, because this interrupts. It is the one thing on the screen that
     * has to be read before anything else is done, and a screen reader that
     * announced it only when somebody happened to reach it would announce it
     * too late.
     */
    <View role="alert" style={styles.panel}>
      <Text style={styles.title}>{t("tokens.secretTitle")}</Text>
      <Text style={styles.warning}>{t("tokens.secretOnce")}</Text>

      {/*
        The secret and the control that takes it are one block, so the control
        cannot end up anywhere but beside the string it is about — which is
        where it was NOT, before: a full-width button below the warning, the
        secret and the note about the scheme.
      */}
      <CopyableValue
        value={secret}
        valueLabel={t("tokens.secretLabel", { name })}
        copyLabel={t("tokens.copyAction")}
        copiedLabel={t("tokens.copied")}
        failedLabel={t("tokens.copyFailedPhone")}
      />

      {/*
        What the credential is FOR, and the scheme it travels under. `Machine`
        is its own scheme (ADR 17) and the mistake anybody makes at one in the
        morning is `Bearer` — which fails as a 401 that looks exactly like a
        bad credential, so nobody suspects the header.
      */}
      <Text style={styles.how}>{t("tokens.secretHow")}</Text>

      {/*
        One button here now, and it is the one that takes the panel away.
        "I have stored it" keeps its words for the reason every rare and
        irreversible act in this app does: there is no shape that means it.
      */}
      <Button tone="secondary" label={t("tokens.storedAction")} onPress={onDismiss}>
        {t("tokens.storedAction")}
      </Button>

      {/*
        Below the dismiss button on purpose. Somebody who only wants the secret
        has already been served by everything above this line; somebody who is
        about to go and configure the MCP server saves retyping both halves.
      */}
      <View style={styles.pair}>
        <Text style={styles.note}>{t("tokens.pairNote")}</Text>
        <CopyableValue
          multiline
          value={pair}
          valueLabel={t("tokens.pairLabel", { name })}
          copyLabel={t("tokens.pairCopy")}
          copiedLabel={t("tokens.pairCopied")}
          failedLabel={t("tokens.copyFailedPhone")}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    gap: space.s2,
    padding: space.s4,
    borderRadius: radius.m,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    backgroundColor: colors.surfaceRaised,
    alignItems: "flex-start",
  },
  title: { color: colors.ink, fontSize: text.m, fontWeight: "700" },
  warning: { color: colors.ink, fontSize: text.s, lineHeight: 20 },
  how: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
  note: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
  pair: {
    gap: space.s2,
    alignSelf: "stretch",
    paddingTop: space.s3,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "flex-start",
  },
});
