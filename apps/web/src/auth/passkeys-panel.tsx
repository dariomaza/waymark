import { describeFailure, passkeyFailureMessage } from "@waymark/i18n";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { TextField } from "../ui/atoms/text-field.js";
import { useTranslate } from "../app/language-context.js";
import { PasskeyCancelled } from "./passkey-platform.js";
import {
  useAddPasskey,
  usePasskeys,
  usePasskeySupport,
  useRemovePasskey,
} from "./passkey-queries.js";
import { PasskeyRow } from "./views/passkey-row.js";
import "./passkeys-panel.css";

/**
 * # The devices that can open this account, managed by the person they belong to
 *
 * It sits beside the machine tokens in the account sheet, and the two are
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
 * Only the ADD button is hidden when the platform has no authenticator. A
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
   * One place for every refusal this panel can meet. The ones it has real
   * answers for come back as translated sentences; everything else falls
   * through to the API's own words, which beats a Spanish sentence invented
   * here for a refusal nobody has met yet.
   *
   * A dismissed prompt is not in here at all: nothing was refused, so it is
   * drawn as a note rather than as a failure.
   */
  const cancelled = add.error instanceof PasskeyCancelled;
  const refusal = cancelled ? null : (add.error ?? remove.error ?? null);

  const onAdd = (event: FormEvent): void => {
    event.preventDefault();

    add.mutate(label, {
      onSuccess: () => {
        setComposing(false);
        setLabel("");
      },
    });
  };

  return (
    <section className="passkeys" aria-labelledby={`${formId}-title`}>
      <h4 className="passkeys__title" id={`${formId}-title`}>
        {t("passkeys.title")}
      </h4>
      <p className="passkeys__explains">{t("passkeys.explains")}</p>

      {cancelled ? (
        <Callout tone="note">
          <p>{t("passkeys.cancelled")}</p>
        </Callout>
      ) : null}

      {refusal === null ? null : (
        <Callout tone="wrong">
          <p>{t(passkeyFailureMessage(refusal) ?? describeFailure(refusal))}</p>
        </Callout>
      )}

      {passkeys.isPending ? (
        <Loading label={t("passkeys.loading")} />
      ) : passkeys.isError ? (
        <Callout tone="wrong">
          <p>{t(describeFailure(passkeys.error))}</p>
        </Callout>
      ) : passkeys.data.passkeys.length === 0 ? (
        <p className="passkeys__none">{t("passkeys.none")}</p>
      ) : (
        <ul className="passkeys__list">
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

      {support.data !== true ? null : composing ? (
        <form className="passkeys__form" onSubmit={onAdd}>
          <TextField
            id={`${formId}-label`}
            label={t("passkeys.nameLabel")}
            hint={t("passkeys.nameHint")}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
          <div className="passkeys__actions">
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
      ) : (
        <Button
          tone="secondary"
          icon="plus"
          onClick={() => {
            setComposing(true);
          }}
        >
          {t("passkeys.addAction")}
        </Button>
      )}
    </section>
  );
};
