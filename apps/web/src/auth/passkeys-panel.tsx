import {
  describeFailure,
  passkeyCeremonyFailureMessage,
  passkeyFailureMessage,
} from "@waymark/i18n";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { TextField } from "../ui/atoms/text-field.js";
import { SettingsGroup } from "../ui/molecules/settings-group.js";
import { useTranslate } from "../app/language-context.js";
import { PasskeyCancelled, PasskeyCeremonyFailed } from "./passkey-platform.js";
import {
  useAddPasskey,
  usePasskeys,
  usePasskeySupport,
  useRemovePasskey,
} from "./passkey-queries.js";
import { PasskeyRow } from "./views/passkey-row.js";

/**
 * # The devices that can open this account, managed by the person they belong to
 *
 * The account screen's security group. It sits above the machine tokens, and the two are
 * deliberately different shapes even though they are both credentials.
 *
 * A machine token is a key to the shared house: ADR 18 makes every one of them
 * visible to everybody who could have minted one, and creating one hands back
 * a secret that is shown once and never again. A passkey is somebody's thumb:
 * the list is theirs alone, and **there is no secret to show**, because the
 * private half never leaves the authenticator. That is why this panel has no
 * warning banner, no copy button and no "I have stored it" — there is nothing
 * to store, which is the entire point of the thing.
 *
 * ## A container
 *
 * It owns the list, the two mutations, which row is asking and whether the
 * form is open. Everything it draws takes props and knows none of that.
 *
 * ## The list is shown even when this device cannot make one
 *
 * Only the [+] in the group's title line is hidden when the platform has no authenticator. A
 * laptop with no reader is exactly where somebody sits down to remove the
 * passkey on the phone they have just lost, and hiding the whole panel there
 * would take away the screen at the moment it is most needed.
 */
export const PasskeysPanel = (): JSX.Element => {
  const t = useTranslate();
  const formId = useId();

  const passkeys = usePasskeys();
  const support = usePasskeySupport();
  const add = useAddPasskey();
  const remove = useRemovePasskey();

  const [composing, setComposing] = useState(false);
  const [label, setLabel] = useState("");
  const [asking, setAsking] = useState<string | null>(null);

  /**
   * One place for every refusal this panel can meet, sorted by WHO refused.
   *
   * A ceremony that failed on the device never reached the API, so it is
   * described by the browser's own word for it rather than by an HTTP status
   * that does not exist — the hole this panel used to fall into, which ended
   * with somebody being told Waymark had a problem answering a request it was
   * never sent. The refusals the API made keep the sentences they had.
   *
   * A dismissed prompt is not in here at all: nothing was refused, so it is
   * drawn as a note rather than as a failure.
   */
  const cancelled = add.error instanceof PasskeyCancelled;
  const refusal = cancelled ? null : (add.error ?? remove.error ?? null);
  const said =
    refusal === null
      ? null
      : refusal instanceof PasskeyCeremonyFailed
        ? passkeyCeremonyFailureMessage(refusal)
        : (passkeyFailureMessage(refusal) ?? describeFailure(refusal));

  const onAdd = (event: FormEvent): void => {
    event.preventDefault();

    add.mutate(label, {
      onSuccess: () => {
        setComposing(false);
        setLabel("");
      },
    });
  };

  const title = t("account.security");

  return (
    <SettingsGroup
      title={title}
      about={[t("passkeys.explains")]}
      aboutLabel={t("account.moreAbout", { group: title })}
      action={
        support.data !== true || composing ? null : (
          <Button
            tone="quiet"
            icon="plus"
            aria-label={t("passkeys.addAction")}
            onClick={() => {
              setComposing(true);
            }}
          />
        )
      }
      notes={
        <>
          {cancelled ? (
            <Callout tone="note">
              <p>{t("passkeys.cancelled")}</p>
            </Callout>
          ) : null}

          {said === null ? null : (
            <Callout tone="wrong">
              <p>{t(said)}</p>
            </Callout>
          )}
        </>
      }
    >
      {passkeys.isPending ? (
        <div className="settings-group__block">
          <Loading label={t("passkeys.loading")} />
        </div>
      ) : passkeys.isError ? (
        <div className="settings-group__block">
          <Callout tone="wrong">
            <p>{t(describeFailure(passkeys.error))}</p>
          </Callout>
        </div>
      ) : passkeys.data.passkeys.length === 0 ? (
        <div className="settings-group__block">
          <p className="settings-group__empty">{t("passkeys.none")}</p>
        </div>
      ) : (
        <ul aria-label={t("passkeys.title")}>
          {passkeys.data.passkeys.map((passkey) => (
            <PasskeyRow
              key={passkey.id}
              passkey={passkey}
              asking={asking === passkey.id}
              busy={remove.isPending}
              onAsk={() => {
                setAsking(passkey.id);
              }}
              onCancel={() => {
                setAsking(null);
              }}
              onConfirm={() => {
                remove.mutate(passkey.id, {
                  onSettled: () => {
                    setAsking(null);
                  },
                });
              }}
            />
          ))}
        </ul>
      )}

      {support.data === true && composing ? (
        <form className="settings-group__block" onSubmit={onAdd}>
          <TextField
            id={`${formId}-label`}
            label={t("passkeys.nameLabel")}
            hint={t("passkeys.nameHint")}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
          <div className="settings-group__buttons">
            <Button type="submit" tone="primary" disabled={add.isPending}>
              {add.isPending ? t("passkeys.adding") : t("passkeys.addConfirm")}
            </Button>
            <Button
              tone="quiet"
              disabled={add.isPending}
              onClick={() => {
                setComposing(false);
              }}
            >
              {t("action.cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </SettingsGroup>
  );
};
