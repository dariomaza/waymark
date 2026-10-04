import { describeFailure, passwordChangeFailureMessage } from "@waymark/i18n";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { PasswordField } from "../ui/molecules/password-field.js";
import { SettingsGroup } from "../ui/molecules/settings-group.js";
import { useTranslate } from "../app/language-context.js";
import { useChangeOwnPassword } from "./password-queries.js";

/**
 * # Password: changing your own, from the account screen (ADR 26, amended)
 *
 * A group of its own, right after the preferences: it is about the person,
 * as the devices under it are. Its card holds one way in; the form it opens
 * asks for the current password first and the new one second, with the
 * reveal the sign-in form has, and its submit is the form's own commit — the
 * screen's primary action is still not this (ADR 21).
 *
 * The API keeps this session and ends the others, which the ⓘ says before
 * anybody presses anything. A wrong current password is a 401 that ends
 * nothing: it is said as a typo, in this group.
 *
 * A person still holding a temporary password never reaches this screen;
 * the session gate shows them the screen that chooses one, which sends no
 * current password. This one always does.
 */
export const PasswordPanel = (): JSX.Element => {
  const t = useTranslate();
  const formId = useId();
  const change = useChangeOwnPassword();

  const [composing, setComposing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const close = (): void => {
    setComposing(false);
    setCurrent("");
    setNext("");
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    change.mutate({ password: next, currentPassword: current }, { onSuccess: close });
  };

  const title = t("password.group");

  return (
    <SettingsGroup
      title={title}
      about={[t("password.explains")]}
      aboutLabel={t("account.moreAbout", { group: title })}
      notes={
        change.isError ? (
          <Callout tone="wrong">
            <p>{t(passwordChangeFailureMessage(change.error) ?? describeFailure(change.error))}</p>
          </Callout>
        ) : change.isSuccess && !composing ? (
          <Callout tone="note">
            <p>{t("password.changed")}</p>
          </Callout>
        ) : null
      }
    >
      {composing ? (
        <form className="settings-group__block" onSubmit={onSubmit}>
          <PasswordField
            id={`${formId}-current`}
            label={t("password.currentLabel")}
            value={current}
            autoComplete="current-password"
            onChange={(event) => {
              setCurrent(event.target.value);
            }}
          />
          <PasswordField
            id={`${formId}-new`}
            label={t("password.newLabel")}
            hint={t("password.newHint")}
            value={next}
            autoComplete="new-password"
            onChange={(event) => {
              setNext(event.target.value);
            }}
          />
          <div className="settings-group__buttons">
            <Button type="submit" tone="primary" disabled={change.isPending}>
              {change.isPending ? t("password.saving") : t("password.changeConfirm")}
            </Button>
            <Button
              tone="quiet"
              disabled={change.isPending}
              onClick={() => {
                close();
                change.reset();
              }}
            >
              {t("action.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="settings-group__block">
          <Button
            icon="key"
            onClick={() => {
              change.reset();
              setComposing(true);
            }}
          >
            {t("password.changeAction")}
          </Button>
        </div>
      )}
    </SettingsGroup>
  );
};
