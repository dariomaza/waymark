import { MachineTokenScope, type MachineTokenView } from "@waymark/api-client";
import { describeFailure, machineTokenFailureMessage } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { apiEndpoint } from "../app/api-endpoint.js";
import { useTranslate } from "../app/language-context.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { OptionList } from "../ui/atoms/option-list.js";
import { TextField } from "../ui/atoms/text-field.js";
import { colors, space, text } from "../ui/styles/tokens.js";
import {
  useCreateMachineToken,
  useMachineTokens,
  useRevokeMachineToken,
  useRotateMachineToken,
} from "./machine-token-queries.js";
import { ApiAddress } from "./views/api-address.js";
import { IssuedSecret } from "./views/issued-secret.js";
import { MachineTokenRow, type PendingAct } from "./views/machine-token-row.js";

/** The secret currently on screen, and which credential it belongs to. */
interface ShownSecret {
  readonly name: string;
  readonly secret: string;
}

/**
 * # Credentials for programs, managed from the phone in somebody's hand
 *
 * ADR 17 made machine tokens and gave them to a shell. ADR 18 gave them to
 * the web client behind a person's session — because a credential nobody can
 * SEE is a credential nobody revokes. This is the same four routes on the
 * device somebody is actually holding when they decide one has leaked, which
 * is the moment that matters and the one moment an SSH session is furthest
 * away.
 *
 * The CLI is untouched and is still how the first token is made on a fresh
 * installation, before there is an account to sign in with.
 *
 * ## A container
 *
 * It owns the list, the three mutations, which row is asking a question and
 * which secret is on screen. Everything it draws — the rows, the address, the
 * issued secret — takes props and knows nothing about any of that.
 *
 * ## The secret never leaves this component's state
 *
 * Not into the query cache, not into the keystore, not into a route
 * parameter. It is rendered by `IssuedSecret` and it goes when this unmounts,
 * which is when the account tab is left. That is the whole lifetime, on
 * purpose.
 *
 * ## The address is the opposite kind of thing
 *
 * `apiEndpoint()` is read here, once, and handed down as a prop — because a
 * component that reached for the environment itself would be a view that
 * cannot be drawn without one. It is not a secret: it can be copied as often
 * as anybody likes, and it stays on the list after the secret has gone. The
 * two are deliberately not given the same ceremony and deliberately not given
 * the same lifetime.
 */
export const MachineTokensPanel = (): JSX.Element => {
  const t = useTranslate();

  const tokens = useMachineTokens();
  const create = useCreateMachineToken();
  const rotate = useRotateMachineToken();
  const revoke = useRevokeMachineToken();

  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<string>(MachineTokenScope.Read);
  const [asking, setAsking] = useState<{ name: string; act: PendingAct } | null>(null);
  const [shown, setShown] = useState<ShownSecret | null>(null);

  const endpoint = apiEndpoint();

  /**
   * One place for every refusal this panel can meet. The three it has real
   * answers for come back as translated sentences; everything else falls
   * through to the shared description, which beats a sentence invented here
   * for a refusal nobody has met yet.
   */
  const refusal = create.error ?? rotate.error ?? revoke.error ?? null;

  const onCreate = (): void => {
    create.mutate(
      { name, scope },
      {
        onSuccess: (issued) => {
          setShown({ name: issued.machineToken.name, secret: issued.token });
          setComposing(false);
          setName("");
          setScope(MachineTokenScope.Read);
        },
      },
    );
  };

  const onConfirm = (token: MachineTokenView, act: Exclude<PendingAct, null>): void => {
    if (act === "rotate") {
      rotate.mutate(token.name, {
        onSuccess: (issued) => {
          setShown({ name: issued.machineToken.name, secret: issued.token });
          setAsking(null);
        },
      });

      return;
    }

    revoke.mutate(token.name, {
      onSuccess: () => {
        setAsking(null);
      },
    });
  };

  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>
        {t("tokens.title")}
      </Text>
      <Text style={styles.explains}>{t("tokens.explains")}</Text>

      {/*
        The address belongs to the LIST, not to the panel that appears once.
        The secret is shown one time and is then gone for ever; the address is
        not a secret, does not change, and is exactly what somebody coming
        back a month later to rotate a credential needs — at a moment that has
        no issued-secret panel anywhere on it.
      */}
      <ApiAddress endpoint={endpoint} />

      {shown === null ? null : (
        <IssuedSecret
          name={shown.name}
          secret={shown.secret}
          endpoint={endpoint}
          onDismiss={() => {
            setShown(null);
          }}
        />
      )}

      {refusal === null ? null : (
        <Callout tone="wrong">
          {t(machineTokenFailureMessage(refusal) ?? describeFailure(refusal))}
        </Callout>
      )}

      {tokens.isPending ? (
        <Loading label={t("tokens.loading")} />
      ) : tokens.isError ? (
        <Callout tone="wrong">{t(describeFailure(tokens.error))}</Callout>
      ) : tokens.data.machineTokens.length === 0 ? (
        <Text style={styles.none}>{t("tokens.none")}</Text>
      ) : (
        <View style={styles.list} accessibilityLabel={t("tokens.title")}>
          {tokens.data.machineTokens.map((token) => (
            <MachineTokenRow
              key={token.id}
              token={token}
              pending={asking?.name === token.name ? asking.act : null}
              busy={rotate.isPending || revoke.isPending}
              onAsk={(act) => {
                setAsking({ name: token.name, act });
              }}
              onCancel={() => {
                setAsking(null);
              }}
              onConfirm={(act) => {
                onConfirm(token, act);
              }}
            />
          ))}
        </View>
      )}

      {composing ? (
        <View style={styles.form}>
          <TextField
            label={t("tokens.nameLabel")}
            hint={t("tokens.nameHint")}
            value={name}
            /*
             * A credential's name is lower case and has no spaces, and a phone
             * keyboard that capitalises the first letter and offers to correct
             * it is fighting the person typing it — the same problem the
             * password field already solved on this platform.
             */
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            onChangeText={setName}
          />
          {/*
            Rows rather than a picker, like every other choice in this app: on
            Android a picker opens a modal wheel, and a wheel that has to be
            opened to be read hides the very difference — read, or read and
            write — that this choice exists to make.
          */}
          <OptionList
            label={t("tokens.scopeLabel")}
            value={scope}
            options={[
              { value: MachineTokenScope.Read, label: t("tokens.scopeRead") },
              { value: MachineTokenScope.ReadWrite, label: t("tokens.scopeReadWrite") },
            ]}
            onChange={setScope}
          />
          <View style={styles.actions}>
            <Button
              tone="primary"
              disabled={create.isPending}
              label={t("tokens.createAction")}
              onPress={onCreate}
            >
              {create.isPending ? t("tokens.creating") : t("tokens.createAction")}
            </Button>
            <Button
              tone="quiet"
              disabled={create.isPending}
              label={t("action.cancel")}
              onPress={() => {
                setComposing(false);
              }}
            >
              {t("action.cancel")}
            </Button>
          </View>
        </View>
      ) : (
        <Button
          tone="secondary"
          label={t("tokens.newAction")}
          onPress={() => {
            setComposing(true);
          }}
        >
          {t("tokens.newAction")}
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { gap: space.s3, alignItems: "flex-start", alignSelf: "stretch" },
  title: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  explains: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
  none: { color: colors.inkMuted, fontSize: text.m },
  list: { gap: space.s2, alignSelf: "stretch" },
  form: { gap: space.s3, alignSelf: "stretch" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
});
