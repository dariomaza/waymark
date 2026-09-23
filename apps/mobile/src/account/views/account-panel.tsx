import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslate } from "../../app/language-context.js";
import { Avatar } from "../../ui/atoms/avatar.js";
import { Button } from "../../ui/atoms/button.js";
import { ScreenTitle } from "../../ui/atoms/screen-title.js";
import { colors, space, text } from "../../ui/styles/tokens.js";

export interface AccountPanelProps {
  /** `null` only in the instant between the session going and the screen doing. */
  readonly username: string | null;
  /** The control that is ABOUT the language rather than written in it. */
  readonly language: ReactNode;
  /**
   * Credentials for programs. Injected, because it fetches and mutates and
   * this file draws.
   *
   * It goes UNDER the language and ABOVE the way out, which is the order of
   * how often each is wanted and how final each is. Signing out is last on
   * purpose: it is the one control here that ends the session, and a
   * destructive button above a list somebody is scrolling is a button that
   * gets hit by a thumb reaching past it.
   */
  readonly machineTokens: ReactNode;
  readonly busy: boolean;
  readonly onSignOut: () => void;
}

/**
 * Presentational. It draws a name, a language control it was handed, and a
 * button — and knows what a session is as little as the login form does.
 *
 * The big avatar beside the name is the same shape as the small one in the
 * bar, which is what makes the tab legible in the other direction: the circle
 * you tapped and the circle you arrived at are the same thing.
 */
export const AccountPanel = ({
  username,
  language,
  machineTokens,
  busy,
  onSignOut,
}: AccountPanelProps): JSX.Element => {
  const t = useTranslate();

  return (
    <View style={styles.panel}>
      <ScreenTitle>{t("account.title")}</ScreenTitle>
      <Text style={styles.lede}>{t("account.lede")}</Text>

      {username === null ? null : (
        <View style={styles.who}>
          {/*
            * Decorative here, deliberately: the sentence beside it says the
            * whole name, and announcing "DM" first would be reading the
            * abbreviation instead of the answer.
            */}
          <Avatar name={username} size={44} color={colors.accentText} />
          <Text style={styles.name}>{t("shell.signedInAs", { username })}</Text>
        </View>
      )}

      <View style={styles.setting}>
        <Text style={styles.settingLabel}>{t("language.label")}</Text>
        {language}
      </View>

      {machineTokens}

      <Button
        tone="danger"
        block
        disabled={busy}
        label={t("shell.signOut")}
        onPress={onSignOut}
      >
        {t("shell.signOut")}
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { gap: space.s4 },
  lede: { color: colors.inkMuted, fontSize: text.s, marginTop: -space.s3 },
  who: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  name: { color: colors.ink, fontSize: text.m, fontWeight: "600", flexShrink: 1 },
  setting: { gap: space.s2, alignItems: "flex-start" },
  settingLabel: { color: colors.ink, fontSize: text.s, fontWeight: "600" },
});
