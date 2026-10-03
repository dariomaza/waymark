import type { AccountView } from "@waymark/api-client";
import { Role } from "@waymark/domain";
import { accountFailureMessage, describeFailure } from "@waymark/i18n";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { TextField } from "../ui/atoms/text-field.js";
import { PasswordField } from "../ui/molecules/password-field.js";
import { SettingsGroup } from "../ui/molecules/settings-group.js";
import { useTranslate } from "../app/language-context.js";
import {
  useAccounts,
  useChangeAccountRole,
  useCreateAccount,
  useEnableAccount,
  useIsAdministrator,
} from "./people-queries.js";
import { DisablePersonSheet, ResetPasswordSheet } from "./person-sheets.js";
import { useSession } from "./use-session.js";
import { PersonRow, type PersonAct } from "./views/person-row.js";

/** The question a sheet is asking about one person, if any. */
interface Asking {
  readonly account: AccountView;
  readonly act: "reset" | "disable";
}

/**
 * # People: an administrator manages the other accounts (ADR 26)
 *
 * Drawn only when `/auth/me` says the person signed in is an administrator;
 * for anybody else it is nothing, and the list is never asked for. The first
 * account is still made from a shell, and there is still no sign-up.
 *
 * ## One primary action, a menu for the rest (ADR 21)
 *
 * Adding a person is the [+] in the group's title line, as a new machine
 * token is. Everything that can be done to somebody already here is in the
 * menu beside their name. Disabling and resetting a password take something
 * away from a person who is not in the room, so each is asked in a sheet that
 * says what happens before the button does it. Changing a role and enabling
 * are done at once: neither signs anybody out, and each is undone the same
 * way.
 *
 * ## A container
 *
 * It owns the list, the mutations, the form and which question is being
 * asked; `PersonRow` draws a row and knows none of that. The phone draws the
 * same group from `apps/mobile/src/auth/people-panel.tsx`.
 */
export const PeoplePanel = (): JSX.Element | null => {
  const administrator = useIsAdministrator();

  return administrator ? <People /> : null;
};

const People = (): JSX.Element => {
  const t = useTranslate();
  const formId = useId();
  const you = useSession()?.user.id ?? null;

  const accounts = useAccounts(true);
  const create = useCreateAccount();
  const changeRole = useChangeAccountRole();
  const enable = useEnableAccount();

  const [composing, setComposing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(Role.USER);
  const [asking, setAsking] = useState<Asking | null>(null);

  /**
   * The refusals met on the group itself rather than inside a sheet. The ones
   * this group has its own answer for are said in its words; anything else in
   * the shared ones, which name the layer that failed.
   */
  const refusal = create.error ?? changeRole.error ?? enable.error ?? null;

  const onCreate = (event: FormEvent): void => {
    event.preventDefault();

    create.mutate(
      { username, role },
      {
        onSuccess: () => {
          setComposing(false);
          setUsername("");
          setPassword("");
          setRole(Role.USER);
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
    <SettingsGroup
      title={title}
      about={[t("people.explains"), t("people.handOver")]}
      aboutLabel={t("account.moreAbout", { group: title })}
      action={
        composing ? null : (
          <Button
            tone="quiet"
            icon="plus"
            aria-label={t("people.addAction")}
            onClick={() => {
              setComposing(true);
            }}
          />
        )
      }
      notes={
        refusal === null ? null : (
          <Callout tone="wrong">
            <p>{t(accountFailureMessage(refusal) ?? describeFailure(refusal))}</p>
          </Callout>
        )
      }
    >
      {accounts.isPending ? (
        <div className="settings-group__block">
          <Loading label={t("people.loading")} />
        </div>
      ) : accounts.isError ? (
        <div className="settings-group__block">
          <Callout tone="wrong">
            <p>{t(accountFailureMessage(accounts.error) ?? describeFailure(accounts.error))}</p>
          </Callout>
        </div>
      ) : (
        <ul aria-label={title}>
          {accounts.data.accounts.map((account) => (
            <PersonRow
              key={account.id}
              account={account}
              isYou={account.id === you}
              onAct={(act) => {
                onAct(account, act);
              }}
            />
          ))}
        </ul>
      )}

      {composing ? (
        <form className="settings-group__block" onSubmit={onCreate}>
          <TextField
            id={`${formId}-username`}
            label={t("people.usernameLabel")}
            value={username}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
          {/*
            One field with the reveal the sign-in form has, rather than two to
            compare: the administrator is about to read it out or write it
            down, so seeing it is the check.
          */}
          <PasswordField
            id={`${formId}-password`}
            label={t("people.passwordLabel")}
            hint={t("people.passwordHint")}
            value={password}
            autoComplete="new-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <SelectField
            id={`${formId}-role`}
            label={t("people.roleLabel")}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as Role);
            }}
            options={[
              { value: Role.USER, label: t("people.roleUser") },
              { value: Role.ADMINISTRATOR, label: t("people.roleAdministrator") },
            ]}
          />
          <div className="settings-group__buttons">
            <Button type="submit" tone="primary" disabled={create.isPending}>
              {create.isPending ? t("people.creating") : t("people.createAction")}
            </Button>
            <Button
              tone="quiet"
              disabled={create.isPending}
              onClick={() => {
                setComposing(false);
                create.reset();
              }}
            >
              {t("action.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

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
    </SettingsGroup>
  );
};
