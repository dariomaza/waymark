import { MachineTokenScope, type MachineTokenView } from "@waymark/api-client";
import { machineTokenFailureMessage, describeFailure } from "@waymark/i18n";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { TextField } from "../ui/atoms/text-field.js";
import { useTranslate } from "../app/language-context.js";
import {
  useCreateMachineToken,
  useMachineTokens,
  useRevokeMachineToken,
  useRotateMachineToken,
} from "./machine-token-queries.js";
import { IssuedSecret } from "./views/issued-secret.js";
import { MachineTokenRow, type PendingAct } from "./views/machine-token-row.js";
import "./machine-tokens-panel.css";

/** The secret currently on screen, and which credential it belongs to. */
interface ShownSecret {
  readonly name: string;
  readonly secret: string;
}

/**
 * # Credentials for programs, managed by the person who owns the house
 *
 * ADR 17 made machine tokens and gave them to a shell. ADR 18 gave them to
 * this panel as well, behind a person's session — because a credential nobody
 * can SEE is a credential nobody revokes, and until now the only way to see
 * one was to SSH into the box. `lastUsedAt` existed for exactly that purpose
 * and was visible to one person on one laptop.
 *
 * The CLI is untouched and is still how the first token is made on a fresh
 * installation, before there is an account to sign in with.
 *
 * ## A container
 *
 * It owns the list, the three mutations, which row is asking a question and
 * which secret is on screen. Everything it draws — the rows, the issued secret
 * — takes props and knows nothing about any of that.
 *
 * ## The secret never leaves this component's state
 *
 * Not into the query cache, not into `localStorage`, not into a URL. It is
 * rendered by `IssuedSecret` and it goes when this unmounts, which is when the
 * account sheet closes. That is the whole lifetime, on purpose.
 */
export const MachineTokensPanel = (): JSX.Element => {
  const t = useTranslate();
  const formId = useId();

  const tokens = useMachineTokens();
  const create = useCreateMachineToken();
  const rotate = useRotateMachineToken();
  const revoke = useRevokeMachineToken();

  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<string>(MachineTokenScope.Read);
  const [asking, setAsking] = useState<{ name: string; act: PendingAct } | null>(null);
  const [shown, setShown] = useState<ShownSecret | null>(null);

  /**
   * One place for every refusal this panel can meet. The three it has real
   * answers for come back as translated sentences; everything else falls
   * through to the API's own words, which beats a Spanish sentence invented
   * here for a refusal nobody has met yet.
   */
  const refusal = create.error ?? rotate.error ?? revoke.error ?? null;

  const onCreate = (event: FormEvent): void => {
    event.preventDefault();

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
    <section className="machine-tokens" aria-labelledby={`${formId}-title`}>
      <h4 className="machine-tokens__title" id={`${formId}-title`}>
        {t("tokens.title")}
      </h4>
      <p className="machine-tokens__explains">{t("tokens.explains")}</p>

      {shown === null ? null : (
        <IssuedSecret
          name={shown.name}
          secret={shown.secret}
          onDismiss={() => {
            setShown(null);
          }}
        />
      )}

      {refusal === null ? null : (
        <Callout tone="wrong">
          <p>{t(machineTokenFailureMessage(refusal) ?? describeFailure(refusal))}</p>
        </Callout>
      )}

      {tokens.isPending ? (
        <Loading label={t("tokens.loading")} />
      ) : tokens.isError ? (
        <Callout tone="wrong">
          <p>{t(describeFailure(tokens.error))}</p>
        </Callout>
      ) : tokens.data.machineTokens.length === 0 ? (
        <p className="machine-tokens__none">{t("tokens.none")}</p>
      ) : (
        <ul className="machine-tokens__list">
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
        </ul>
      )}

      {composing ? (
        <form className="machine-tokens__form" onSubmit={onCreate}>
          <TextField
            id={`${formId}-name`}
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
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <SelectField
            id={`${formId}-scope`}
            label={t("tokens.scopeLabel")}
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
            }}
            options={[
              { value: MachineTokenScope.Read, label: t("tokens.scopeRead") },
              {
                value: MachineTokenScope.ReadWrite,
                label: t("tokens.scopeReadWrite"),
              },
            ]}
          />
          <div className="machine-tokens__actions">
            <Button type="submit" tone="primary" disabled={create.isPending}>
              {create.isPending ? t("tokens.creating") : t("tokens.createAction")}
            </Button>
            <Button
              tone="quiet"
              disabled={create.isPending}
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
          onClick={() => {
            setComposing(true);
          }}
        >
          {t("tokens.newAction")}
        </Button>
      )}
    </section>
  );
};
