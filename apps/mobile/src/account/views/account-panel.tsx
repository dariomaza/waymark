import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslate } from "../../app/language-context.js";
import { Avatar } from "../../ui/atoms/avatar.js";
import { Button } from "../../ui/atoms/button.js";
import { SettingsGroup } from "../../ui/molecules/settings-group.js";
import { space, text } from "../../ui/styles/tokens.js";
import { themed } from "../../ui/styles/theme.js";

export interface AccountPanelProps {
  /** `null` only in the instant between the session going and the screen doing. */
  readonly username: string | null;
  /** The language row of the preferences. */
  readonly language: ReactNode;
  /** The appearance row of the preferences: light, dark or the phone's own (ADR 25). */
  readonly appearance: ReactNode;
  /** The password group: changing your own (ADR 26, amended). It mutates. */
  readonly password: ReactNode;
  /**
   * The security group: whether this phone keeps the session behind its
   * fingerprint sensor.
   *
   * Injected, and often nothing at all: a phone with no sensor, nothing
   * enrolled or no screen lock gets no group, and that decision belongs to
   * the thing that can ask the keystore rather than to this file.
   */
  readonly biometrics: ReactNode;
  /**
   * The connected programs group: credentials for programs. Injected, because
   * it fetches and mutates and this file draws. Last, because the screen is
   * ordered from "you" outwards.
   */
  readonly machineTokens: ReactNode;
  /**
   * The people in the house (ADR 26), drawn by the group itself only for an
   * administrator and as nothing for anybody else. Last, because it is the
   * furthest out from "you".
   */
  readonly people: ReactNode;
  readonly busy: boolean;
  readonly onSignOut: () => void;
}

/**
 * Presentational. It draws who is signed in, the way out, and the groups it
 * was handed — the browser's account panel, in the same order.
 *
 * ## The way out is beside the name
 *
 * It was a full-width word button at the bottom of everything. It acts on the
 * person whose name it sits beside, so it is a quiet 48 square there, named
 * in words for a screen reader: it ends a session, it does not delete
 * anything.
 *
 * ## The screen's name is kept, and not drawn
 *
 * The bar already says "You" under the avatar that brought somebody here. The
 * heading stays for a screen reader, drawn at no size at all.
 */
export const AccountPanel = ({
  username,
  language,
  appearance,
  password,
  biometrics,
  machineTokens,
  people,
  busy,
  onSignOut,
}: AccountPanelProps): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();

  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.hidden}>
        {t("account.title")}
      </Text>

      <View style={styles.who}>
        {username === null ? null : (
          <>
            {/*
              * Decorative here, deliberately: the name beside it is the
              * answer, and announcing "DM" first would be reading the
              * abbreviation instead.
              */}
            <Avatar name={username} size={44} filled />
            <View style={styles.name}>
              <Text style={styles.username}>{username}</Text>
              <Text style={styles.state}>{t("account.signedIn")}</Text>
            </View>
          </>
        )}
        <View style={styles.out}>
          <Button
            tone="quiet"
            icon="signOut"
            disabled={busy}
            label={t("shell.signOut")}
            onPress={onSignOut}
          />
        </View>
      </View>

      <SettingsGroup title={t("account.preferences")}>
        {language}
        {appearance}
      </SettingsGroup>

      {password}

      {biometrics}

      {machineTokens}

      {people}
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    panel: { gap: space.s5 },
    hidden: { position: "absolute", width: 1, height: 1, opacity: 0, color: colors.ink },
    who: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingLeft: space.s2 },
    name: { flex: 1 },
    username: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
    state: { color: colors.inkMuted, fontSize: text.s },
    out: { marginLeft: "auto" },
  }),
);
