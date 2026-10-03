import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { CopyableValue } from "../../ui/molecules/copyable-value.js";
import { radius, space, text } from "../../ui/styles/tokens.js";
import { themed } from "../../ui/styles/theme.js";
import { useTranslate } from "../../app/language-context.js";

export interface TemporaryPasswordProps {
  /** Whose password it is, so the panel can name them. */
  readonly username: string;
  /** The only copy that will ever exist. */
  readonly password: string;
  readonly onDismiss: () => void;
}

/**
 * # A temporary password, shown the one time it can be (ADR 26, amended)
 *
 * The server generated it after adding a person or resetting a password and
 * kept only a hash. It is the same kind of thing a machine token's secret is,
 * and gets the same treatment as `IssuedSecret`: the warning, the password,
 * the copy button and the way out are one panel, the warning before the way
 * out. It lives in the parent's state and goes with it — never the keystore,
 * never the query cache, never logged, never in a route parameter.
 *
 * Copying is offered for the reason `IssuedSecret` gives: the alternative on a
 * phone is a screenshot, which is a permanent file in a library that syncs.
 *
 * Presentational: it is handed the password and one callback.
 */
export const TemporaryPassword = ({
  username,
  password,
  onDismiss,
}: TemporaryPasswordProps): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();

  return (
    // `alert`, because this interrupts: it has to be read before anything else.
    <View role="alert" style={styles.panel}>
      <Text style={styles.title}>{t("people.temporaryTitle", { username })}</Text>
      <Text style={styles.warning}>{t("people.temporaryOnce", { username })}</Text>

      <CopyableValue
        value={password}
        valueLabel={t("people.temporaryLabel", { username })}
        copyLabel={t("tokens.copyAction")}
        copiedLabel={t("tokens.copied")}
        failedLabel={t("tokens.copyFailedPhone")}
      />

      <Button tone="secondary" label={t("people.temporaryDone")} onPress={onDismiss}>
        {t("people.temporaryDone")}
      </Button>
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
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
  }),
);
