import { MachineTokenScope, type MachineTokenView } from "@waymark/api-client";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/atoms/button.js";
import { Callout } from "../../ui/atoms/callout.js";
import { colors, radius, space, text } from "../../ui/styles/tokens.js";
import { useLanguageChoice, useTranslate } from "../../app/language-context.js";

/** Which confirmation this row is currently asking, if any. */
export type PendingAct = "rotate" | "revoke" | null;

export interface MachineTokenRowProps {
  readonly token: MachineTokenView;
  readonly pending: PendingAct;
  readonly busy: boolean;
  readonly onAsk: (act: Exclude<PendingAct, null>) => void;
  readonly onCancel: () => void;
  readonly onConfirm: (act: Exclude<PendingAct, null>) => void;
}

/**
 * One credential, and the two things that can be done to it.
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
  const t = useTranslate();
  const { language } = useLanguageChoice();

  const when = (moment: string): string =>
    new Date(moment).toLocaleDateString(language, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={styles.name}>{token.name}</Text>
        <Text style={styles.scope}>
          {token.scope === MachineTokenScope.ReadWrite
            ? t("tokens.scopeReadWrite")
            : t("tokens.scopeRead")}
        </Text>
      </View>

      {/*
        `lastUsedAt` first, because it is the fact somebody came for: a
        credential nobody can see being used is one nobody will ever revoke.
      */}
      <Text style={styles.fact}>
        {token.lastUsedAt === null
          ? t("tokens.neverUsed")
          : t("tokens.lastUsedOn", { when: when(token.lastUsedAt) })}
      </Text>
      <Text style={styles.fact}>{t("tokens.createdOn", { when: when(token.createdAt) })}</Text>
      <Text style={styles.fact}>
        {token.expiresAt === null
          ? t("tokens.neverLapses")
          : t("tokens.lapsesOn", { when: when(token.expiresAt) })}
      </Text>

      {pending === null ? (
        <View style={styles.actions}>
          <Button
            tone="secondary"
            label={t("tokens.rotateAction")}
            onPress={() => {
              onAsk("rotate");
            }}
          >
            {t("tokens.rotateAction")}
          </Button>
          <Button
            tone="danger"
            label={t("tokens.revokeAction")}
            onPress={() => {
              onAsk("revoke");
            }}
          >
            {t("tokens.revokeAction")}
          </Button>
        </View>
      ) : (
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
              <Button
                tone="quiet"
                disabled={busy}
                label={t("action.cancel")}
                onPress={onCancel}
              >
                {t("action.cancel")}
              </Button>
            </>
          }
        >
          {pending === "rotate"
            ? t("tokens.rotateWarning", { name: token.name })
            : t("tokens.revokeWarning", { name: token.name })}
        </Callout>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    gap: space.s1,
    padding: space.s3,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
  },
  name: { color: colors.ink, fontSize: text.m, fontWeight: "700", flexShrink: 1 },
  scope: { color: colors.inkMuted, fontSize: text.s },
  fact: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s2,
    marginTop: space.s2,
  },
});
