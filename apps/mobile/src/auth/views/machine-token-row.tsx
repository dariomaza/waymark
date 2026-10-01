import { MachineTokenScope, type ListedMachineTokenView } from "@waymark/api-client";
import { shortDate } from "@waymark/i18n";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { SettingsItem } from "../../ui/molecules/settings-item.js";
import { space, text } from "../../ui/styles/tokens.js";
import { themed } from "../../ui/styles/theme.js";
import { useLanguageChoice, useTranslate } from "../../app/language-context.js";

/** Which confirmation this row is currently asking, if any. */
export type PendingAct = "rotate" | "revoke" | null;

export interface MachineTokenRowProps {
  readonly token: ListedMachineTokenView;
  readonly pending: PendingAct;
  readonly busy: boolean;
  readonly onAsk: (act: Exclude<PendingAct, null>) => void;
  readonly onCancel: () => void;
  readonly onConfirm: (act: Exclude<PendingAct, null>) => void;
}

/**
 * One credential, and the two things that can be done to it: a row of the
 * connected programs card, its scope a chip and its two acts two icons at the
 * end — rotate, and the bin that revokes. The browser draws the same row.
 *
 * Presentational to the bone: it is handed a token and some callbacks, and it
 * knows nothing about requests, caches or which of these is in flight.
 *
 * ## Why the confirmation is inline rather than a sheet
 *
 * Rotating and revoking are both destructive and both need a sentence about a
 * consequence, and that sentence belongs beside the credential it is about
 * rather than in a panel that has slid up over it. A sheet would also cover
 * the list — so the one question it is asking ("which of these am I about to
 * kill?") would be answered by a name the sheet had just hidden.
 */
export const MachineTokenRow = ({
  token,
  pending,
  busy,
  onAsk,
  onCancel,
  onConfirm,
}: MachineTokenRowProps): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();
  const { language } = useLanguageChoice();

  const when = (moment: string): string => shortDate(moment, language);

  const confirm =
    pending === null ? null : (
      /*
       * `blocked` rather than `wrong`: this is a statement about the WORLD
       * and what is about to happen to it, not a complaint about a request
       * (ADR 8, as the tone of the box a sentence goes in).
       */
      <Callout
        tone="blocked"
        title={
          pending === "rotate"
            ? t("tokens.rotateTitle", { name: token.name })
            : t("tokens.revokeTitle", { name: token.name })
        }
        action={
          <>
            <Button
              tone={pending === "revoke" ? "danger" : "primary"}
              disabled={busy}
              onPress={() => {
                onConfirm(pending);
              }}
            >
              {busy
                ? pending === "rotate"
                  ? t("tokens.rotating")
                  : t("tokens.revoking")
                : pending === "rotate"
                  ? t("tokens.rotateConfirm")
                  : t("tokens.revokeConfirm")}
            </Button>
            <Button tone="quiet" disabled={busy} label={t("action.cancel")} onPress={onCancel}>
              {t("action.cancel")}
            </Button>
          </>
        }
      >
        {pending === "rotate"
          ? t("tokens.rotateWarning", { name: token.name })
          : t("tokens.revokeWarning", { name: token.name })}
      </Callout>
    );

  return (
    <SettingsItem
      icon="key"
      below={confirm}
      actions={
        pending === null ? (
          <>
            <Button
              tone="quiet"
              icon="rotate"
              label={t("tokens.rotateAction")}
              onPress={() => {
                onAsk("rotate");
              }}
            />
            <Button
              tone="quiet"
              icon="trash"
              label={t("tokens.revokeAction")}
              onPress={() => {
                onAsk("revoke");
              }}
            />
          </>
        ) : undefined
      }
    >
      <Text style={styles.name}>{token.name}</Text>
      {/*
        One line of facts, what it may do first as a chip. Then `lastUsedAt`,
        because it is the fact somebody came for: a credential nobody can see
        being used is one nobody will ever revoke. When it lapses is said only
        when it does.
      */}
      <View style={styles.facts}>
        <Text style={styles.scope}>
          {token.scope === MachineTokenScope.ReadWrite
            ? t("tokens.scopeReadWrite")
            : t("tokens.scopeRead")}
        </Text>
        <Text style={styles.fact}>
          {token.lastUsedAt === null
            ? t("tokens.neverUsed")
            : t("tokens.lastUsedOn", { when: when(token.lastUsedAt) })}
        </Text>
        {token.expiresAt === null ? null : (
          <Text style={styles.fact}>{t("tokens.lapsesOn", { when: when(token.expiresAt) })}</Text>
        )}
        {/* What a narrowed token sees; a whole one says nothing (ADR 26). */}
        {token.spaces === null || token.spaces === undefined ? null : (
          <Text style={styles.fact}>
            {token.spaces.length === 0
              ? t("tokens.seesNothing")
              : t("tokens.seesOnly", { spaces: token.spaces.map((chosenSpace) => chosenSpace.name).join(", ") })}
          </Text>
        )}
        {/* Only an administrator's list says whose a token is (ADR 26). */}
        {token.issuedBy === undefined ? null : (
          <Text style={styles.fact}>{t("tokens.issuedBy", { username: token.issuedBy })}</Text>
        )}
      </View>
    </SettingsItem>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    // A credential's name is a literal somebody types into a shell.
    name: { color: colors.ink, fontSize: text.s, fontWeight: "700", fontFamily: "monospace" },
    facts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s2 },
    // What it may do, as a small chip rather than a sentence.
    scope: {
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
  }),
);
