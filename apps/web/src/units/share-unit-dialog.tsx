import type { AccountView, StorageUnitView } from "@waymark/api-client";
import { describeFailure, shareFailureMessage } from "@waymark/i18n";
import { Role, ShareLevel } from "@waymark/domain";
import { useId, type JSX } from "react";

import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { Segmented } from "../ui/atoms/segmented.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { SettingRow } from "../ui/molecules/setting-row.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useAccounts } from "../auth/people-queries.js";
import { useChangeShare, useShares, type ShareChoice } from "./share-queries.js";
import { useTranslate } from "../app/language-context.js";

export interface ShareUnitDialogProps {
  readonly unit: StorageUnitView;
  /** Whose tree the space is in: they already change it, so they are not listed. */
  readonly ownerId: string | null;
  readonly onClose: () => void;
}

/**
 * # Who this space is shared with, and how far (ADR 26)
 *
 * An administrator's sheet. Everybody a share would mean something to is
 * listed — every active person but administrators, who see everything, and
 * the space's owner, who already changes it — each with three answers. An
 * answer is saved the moment it is chosen: there is nothing to confirm, so
 * the sheet has no primary and the X is the way out (ADR 22).
 *
 * Only shares placed on THIS space are shown. One placed above it covers it
 * too and is changed there; the line at the top says so the other way round.
 */
export const ShareUnitDialog = ({ unit, ownerId, onClose }: ShareUnitDialogProps): JSX.Element => {
  const t = useTranslate();

  const accounts = useAccounts(true);
  const shares = useShares(unit.id);

  const people = (accounts.data?.accounts ?? []).filter(
    (account) =>
      account.role !== Role.ADMINISTRATOR && account.disabledAt === null && account.id !== ownerId,
  );
  const levelOf = (accountId: string): ShareChoice =>
    shares.data?.shares.find((share) => share.account.id === accountId)?.access ?? "none";

  const failed = accounts.isError ? accounts.error : shares.isError ? shares.error : null;

  return (
    <Sheet title={t("share.title", { name: unit.name })} onClose={onClose}>
      <p>{t("share.cascades")}</p>

      {failed === null ? null : (
        <FailureNote
          error={failed}
          onRetry={() => {
            void accounts.refetch();
            void shares.refetch();
          }}
        />
      )}

      {accounts.isPending || shares.isPending ? <Loading label={t("share.loading")} /> : null}

      {accounts.isSuccess && shares.isSuccess && people.length === 0 ? (
        <p>{t("share.nobody")}</p>
      ) : null}

      {accounts.isSuccess && shares.isSuccess
        ? people.map((person) => (
            <PersonShare
              key={person.id}
              unit={unit}
              person={person}
              level={levelOf(person.id)}
            />
          ))
        : null}
    </Sheet>
  );
};

/** One person's three answers, and the sentence when the last one was refused. */
const PersonShare = ({
  unit,
  person,
  level,
}: {
  readonly unit: StorageUnitView;
  readonly person: AccountView;
  readonly level: ShareChoice;
}): JSX.Element => {
  const t = useTranslate();
  const labelId = useId();
  const change = useChangeShare(unit.id);

  // While the answer is on its way it is already the answer; a refusal puts
  // back what the list says once it is fetched again.
  const shown = change.isPending ? change.variables.choice : level;

  return (
    <div>
      <SettingRow icon="person" label={person.username} labelId={labelId}>
        <Segmented<ShareChoice>
          group={`share-${person.id}`}
          labelledBy={labelId}
          value={shown}
          onChoose={(choice) => {
            change.mutate({ accountId: person.id, choice });
          }}
          options={[
            { value: "none", name: t("share.levelNone"), drawn: { icon: "close" } },
            { value: ShareLevel.VIEW, name: t("share.levelView"), drawn: { icon: "eye" } },
            { value: ShareLevel.EDIT, name: t("share.levelEdit"), drawn: { icon: "pencil" } },
          ]}
        />
      </SettingRow>

      {change.isError ? (
        <Callout tone="blocked">
          {t(shareFailureMessage(change.error) ?? describeFailure(change.error))}
        </Callout>
      ) : null}
    </div>
  );
};
