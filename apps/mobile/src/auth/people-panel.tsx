import type { AccountView } from "@waymark/api-client";
import { Role } from "@waymark/domain";
import { accountFailureMessage, describeFailure } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { StyleSheet, View } from "react-native";

import { useTranslate } from "../app/language-context.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { OptionList } from "../ui/atoms/option-list.js";
import { TextField } from "../ui/atoms/text-field.js";
import { SettingsGroup } from "../ui/molecules/settings-group.js";
import { space } from "../ui/styles/tokens.js";
import {
  useAccounts,
  useChangeAccountRole,
  useCreateAccount,
  useEnableAccount,
  useIsAdministrator,
} from "./people-queries.js";
import { DisablePersonSheet, ResetPasswordSheet } from "./person-sheets.js";
import { useSessionState } from "./use-session.js";
import { PersonRow, type PersonAct } from "./views/person-row.js";
import { TemporaryPassword } from "./views/temporary-password.js";

/** The question a sheet is asking about one person, if any. */
interface Asking {
  readonly account: AccountView;
  readonly act: "reset" | "disable";
}

/**
 * # People: an administrator manages the other accounts (ADR 26)
 *
 * The phone's half of `apps/web/src/auth/people-panel.tsx`, and the same
 * group: drawn only when `/auth/me` says the person signed in is an
 * administrator, nothing at all for anybody else, and the list never asked
 * for unless it is drawn.
 *
 * Adding a person is the [+] in the group's title line (ADR 21). Everything
 * else is in the menu beside each name; disabling and resetting a password
 * are asked first, in a sheet that says what happens. Changing a role and
 * enabling are done at once: neither signs anybody out.
 */
export const PeoplePanel = (): JSX.Element | null => {
  const administrator = useIsAdministrator();

  return administrator ? <People /> : null;
};

const People = (): JSX.Element => {
  const t = useTranslate();
  const state = useSessionState();
  const you = state.status === "known" ? (state.session?.user.id ?? null) : null;

  const accounts = useAccounts(true);
  const create = useCreateAccount();
  const changeRole = useChangeAccountRole();
  const enable = useEnableAccount();

  const [composing, setComposing] = useState(false);
  const [username, setUsername] = useState("");
  /**
   * The temporary password of the person just added: only here, in this
   * component's state, and gone when it is dismissed or the screen is left.
   * Never the query cache, never the keystore (ADR 26, amended).
   */
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [role, setRole] = useState<string>(Role.USER);
  const [asking, setAsking] = useState<Asking | null>(null);

  /** The refusals met on the group itself rather than inside a sheet. */
  const refusal = create.error ?? changeRole.error ?? enable.error ?? null;

  const onCreate = (): void => {
    create.mutate(
      { username, role: role as Role },
      {
        onSuccess: (answer) => {
          setComposing(false);
          setUsername("");
          setRole(Role.USER);
          setIssued({ username: answer.account.username, password: answer.temporaryPassword });
          // Let go of the answer, so the mutation (gcTime 0) is forgotten now
          // rather than when this screen is left.
          create.reset();
        },
      },
    );
  };

  const onAct = (account: AccountView, act: PersonAct): void => {
    changeRole.reset();
    enable.reset();

    if (act === "role") {
      changeRole.mutate({
        id: account.id,
        role: account.role === Role.ADMINISTRATOR ? Role.USER : Role.ADMINISTRATOR,
      });
      return;
    }

    if (act === "enable") {
      enable.mutate(account.id);
      return;
    }

    setAsking({ account, act });
  };

  const title = t("account.people");

  return (
    <>
      <SettingsGroup
        title={title}
        about={[t("people.explains"), t("people.handOver")]}
        aboutLabel={t("account.moreAbout", { group: title })}
        action={
          composing ? null : (
            <Button
              tone="quiet"
              icon="plus"
              label={t("people.addAction")}
              onPress={() => {
                setIssued(null);
                setComposing(true);
              }}
            />
          )
        }
        notes={
          <>
            {issued === null ? null : (
              <TemporaryPassword
                username={issued.username}
                password={issued.password}
                onDismiss={() => {
                  setIssued(null);
                }}
              />
            )}

            {refusal === null ? null : (
              <Callout tone="wrong">
                {t(accountFailureMessage(refusal) ?? describeFailure(refusal))}
              </Callout>
            )}
          </>
        }
      >
        {accounts.isPending ? (
          <View style={styles.block}>
            <Loading label={t("people.loading")} />
          </View>
        ) : accounts.isError ? (
          <View style={styles.block}>
            <Callout tone="wrong">
              {t(accountFailureMessage(accounts.error) ?? describeFailure(accounts.error))}
            </Callout>
          </View>
        ) : (
          accounts.data.accounts.map((account) => (
            <PersonRow
              key={account.id}
              account={account}
              isYou={account.id === you}
              onAct={(act) => {
                onAct(account, act);
              }}
            />
          ))
        )}

        {composing ? (
          <View style={styles.block}>
            <TextField
              label={t("people.usernameLabel")}
              value={username}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              onChangeText={setUsername}
            />
            {/* Rows rather than a picker, like every other choice in this app. */}
            <OptionList
              label={t("people.roleLabel")}
              value={role}
              options={[
                { value: Role.USER, label: t("people.roleUser") },
                { value: Role.ADMINISTRATOR, label: t("people.roleAdministrator") },
              ]}
              onChange={setRole}
            />
            <View style={styles.actions}>
              <Button
                tone="primary"
                disabled={create.isPending}
                label={t("people.createAction")}
                onPress={onCreate}
              >
                {create.isPending ? t("people.creating") : t("people.createAction")}
              </Button>
              <Button
                tone="quiet"
                disabled={create.isPending}
                label={t("action.cancel")}
                onPress={() => {
                  setComposing(false);
                  create.reset();
                }}
              >
                {t("action.cancel")}
              </Button>
            </View>
          </View>
        ) : null}
      </SettingsGroup>

      {asking === null ? null : asking.act === "reset" ? (
        <ResetPasswordSheet
          account={asking.account}
          onClose={() => {
            setAsking(null);
          }}
        />
      ) : (
        <DisablePersonSheet
          account={asking.account}
          onClose={() => {
            setAsking(null);
          }}
        />
      )}
    </>
  );
};

// Nothing here is a colour, so nothing here waits for the scheme on screen.
const styles = StyleSheet.create({
  // Anything in the card that is not a row of its own gets the rows' inset.
  block: { gap: space.s3, paddingVertical: space.s3, paddingHorizontal: space.s4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
});
