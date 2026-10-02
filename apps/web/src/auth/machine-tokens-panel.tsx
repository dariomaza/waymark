import { flattenUnits, MachineTokenScope, type MachineTokenView } from "@waymark/api-client";
import { machineTokenFailureMessage, describeFailure } from "@waymark/i18n";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { TextField } from "../ui/atoms/text-field.js";
import { SettingsGroup } from "../ui/molecules/settings-group.js";
import { apiEndpoint } from "../app/api-endpoint.js";
import { useStorageUnitTree } from "../units/unit-queries.js";
import { useTranslate } from "../app/language-context.js";
import {
  useCreateMachineToken,
  useMachineTokens,
  useRevokeMachineToken,
  useRotateMachineToken,
} from "./machine-token-queries.js";
import { ApiAddress } from "./views/api-address.js";
import { IssuedSecret } from "./views/issued-secret.js";
import { MachineTokenRow, type PendingAct } from "./views/machine-token-row.js";
import { SpaceChoice } from "./views/space-choice.js";

/** How much of the house a new token may see (ADR 26). */
type Reach = "everything" | "chosen";

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
 * — takes props and knows nothing about any of that. It is drawn as the
 * account screen's connected programs group: the address and the tokens are
 * rows of one card, and a new one is the [+] in the group's title line.
 *
 * ## The secret never leaves this component's state
 *
 * Not into the query cache, not into `localStorage`, not into a URL. It is
 * rendered by `IssuedSecret` and it goes when this unmounts, which is when the
 * account screen is left. That is the whole lifetime, on purpose.
 *
 * ## The address is the opposite kind of thing
 *
 * `apiEndpoint()` is read here, once, and handed down as a prop — because a
 * component that reached for `window.location` itself would be a view that
 * cannot be drawn without a browser. It is not a secret: it is re-read on
 * every render, it can be copied as often as anybody likes, and it stays on
 * the list after the secret has gone. The two are deliberately not given the
 * same ceremony and deliberately not given the same lifetime.
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
  const [reach, setReach] = useState<Reach>("everything");
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const tree = useStorageUnitTree();
  const [asking, setAsking] = useState<{ name: string; act: PendingAct } | null>(null);
  const [shown, setShown] = useState<ShownSecret | null>(null);

  /**
   * Where the calls a machine token authenticates actually go. Derived from
   * the document this app was served from rather than from the build, for the
   * reasons in `app/api-endpoint.ts` — a bundle carries no hostname (ADR 16),
   * so the only source that is true on somebody else's phone is the browser.
   */
  const endpoint = apiEndpoint();

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
      { name, scope, ...(reach === "chosen" ? { spaceIds: chosen } : {}) },
      {
        onSuccess: (issued) => {
          setShown({ name: issued.machineToken.name, secret: issued.token });
          setComposing(false);
          setName("");
          setScope(MachineTokenScope.Read);
          setReach("everything");
          setChosen([]);
        },
      },
    );
  };

  /**
   * "Only the spaces you choose" with none ticked cannot be sent: leaving the
   * spaces off would mean everything, the opposite of what was asked for.
   */
  const nothingChosen = reach === "chosen" && chosen.length === 0;

  const toggle = (spaceId: string): void => {
    setChosen((current) =>
      current.includes(spaceId) ? current.filter((id) => id !== spaceId) : [...current, spaceId],
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

  const title = t("account.programs");

  return (
    <SettingsGroup
      title={title}
      about={[t("tokens.explains"), t("tokens.addressNote")]}
      aboutLabel={t("account.moreAbout", { group: title })}
      action={
        composing ? null : (
          <Button
            tone="quiet"
            icon="plus"
            aria-label={t("tokens.newAction")}
            onClick={() => {
              setComposing(true);
            }}
          />
        )
      }
      notes={
        <>
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
              <p>{t(machineTokenFailureMessage(refusal) ?? describeFailure(refusal))}</p>
            </Callout>
          )}
        </>
      }
    >
      {/*
        The address belongs to the LIST, not to the panel that appears once.
        The secret is shown one time and is then gone for ever; the address is
        not a secret, does not change, and is exactly what somebody coming
        back a month later to rotate a credential needs — at a moment that has
        no issued-secret panel anywhere on it. So it is the card's first row.
      */}
      <ApiAddress endpoint={endpoint} />

      {tokens.isPending ? (
        <div className="settings-group__block">
          <Loading label={t("tokens.loading")} />
        </div>
      ) : tokens.isError ? (
        <div className="settings-group__block">
          <Callout tone="wrong">
            <p>{t(describeFailure(tokens.error))}</p>
          </Callout>
        </div>
      ) : tokens.data.machineTokens.length === 0 ? (
        <div className="settings-group__block">
          <p className="settings-group__empty">{t("tokens.none")}</p>
        </div>
      ) : (
        <ul aria-label={t("tokens.title")}>
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
        <form className="settings-group__block" onSubmit={onCreate}>
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
          <SelectField
            id={`${formId}-reach`}
            label={t("tokens.reachLabel")}
            value={reach}
            onChange={(event) => {
              setReach(event.target.value as Reach);
            }}
            options={[
              { value: "everything", label: t("tokens.reachEverything") },
              { value: "chosen", label: t("tokens.reachChosen") },
            ]}
          />
          {reach === "chosen" ? (
            <SpaceChoice
              spaces={flattenUnits(tree.data?.tree ?? [])}
              chosen={chosen}
              onToggle={toggle}
            />
          ) : null}
          <div className="settings-group__buttons">
            <Button type="submit" tone="primary" disabled={create.isPending || nothingChosen}>
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
      ) : null}
    </SettingsGroup>
  );
};
