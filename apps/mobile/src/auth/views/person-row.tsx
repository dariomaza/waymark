import type { AccountView } from "@waymark/api-client";
import { Role } from "@waymark/domain";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OverflowMenu, type OverflowAction } from "../../ui/molecules/overflow-menu.js";
import { SettingsItem } from "../../ui/molecules/settings-item.js";
import { space, text } from "../../ui/styles/tokens.js";
import { themed } from "../../ui/styles/theme.js";
import { useTranslate } from "../../app/language-context.js";

/** What a person's menu can lead to. Disabling and resetting are asked first. */
export type PersonAct = "role" | "reset" | "disable" | "enable";

export interface PersonRowProps {
  readonly account: AccountView;
  /** The administrator's own row: marked as theirs, and offering nothing. */
  readonly isYou: boolean;
  readonly onAct: (act: PersonAct) => void;
}

/**
 * One person in the house: their name, their role as a chip, whether they
 * are disabled, and a menu beside the name (ADR 21) with everything that can
 * be done to them. The browser draws the same row.
 *
 * Your own row has no menu: every line it would hold is refused for your own
 * account (`OWN_ACCOUNT`, ADR 26), and a menu of refusals is worse than none.
 */
export const PersonRow = ({ account, isYou, onAct }: PersonRowProps): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();

  const disabled = account.disabledAt !== null;
  const administrator = account.role === Role.ADMINISTRATOR;

  const actions: OverflowAction[] = [
    {
      label: administrator ? t("people.makeUser") : t("people.makeAdministrator"),
      onSelect: () => {
        onAct("role");
      },
    },
    {
      label: t("people.resetAction"),
      icon: "key",
      onSelect: () => {
        onAct("reset");
      },
    },
    disabled
      ? {
          label: t("people.enableAction"),
          onSelect: () => {
            onAct("enable");
          },
        }
      : {
          label: t("people.disableAction"),
          tone: "danger",
          destructive: true,
          onSelect: () => {
            onAct("disable");
          },
        },
  ];

  return (
    <SettingsItem
      icon="person"
      actions={
        isYou ? undefined : (
          <OverflowMenu label={t("action.more", { name: account.username })} actions={actions} />
        )
      }
    >
      <Text style={styles.name}>{account.username}</Text>
      <View style={styles.facts}>
        <Text style={styles.role}>
          {administrator ? t("people.roleAdministrator") : t("people.roleUser")}
        </Text>
        {isYou ? <Text style={styles.fact}>{t("people.you")}</Text> : null}
        {account.mustChangePassword ? (
          <Text style={styles.fact}>{t("people.mustChange")}</Text>
        ) : null}
        {disabled ? (
          <Text style={[styles.fact, styles.disabled]}>{t("people.disabled")}</Text>
        ) : null}
      </View>
    </SettingsItem>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    name: { color: colors.ink, fontSize: text.m, fontWeight: "700" },
    facts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s2 },
    // The role, as a small chip rather than a sentence, like a token's scope.
    role: {
      color: colors.inkMuted,
      fontSize: text.xs,
      fontWeight: "600",
      paddingHorizontal: space.s2,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 999,
      overflow: "hidden",
    },
    fact: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
    disabled: { fontWeight: "600" },
  }),
);
