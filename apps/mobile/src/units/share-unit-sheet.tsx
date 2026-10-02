import type { AccountView, StorageUnitView } from "@waymark/api-client";
import { describeFailure, shareFailureMessage } from "@waymark/i18n";
import { Role, ShareLevel } from "@waymark/domain";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Callout } from "../ui/atoms/callout.js";
import { Loading } from "../ui/atoms/loading.js";
import { Segmented } from "../ui/atoms/segmented.js";
import { FailureNote } from "../ui/molecules/failure-note.js";
import { SettingRow } from "../ui/molecules/setting-row.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { space, text } from "../ui/styles/tokens.js";
import { themed } from "../ui/styles/theme.js";
import { useAccounts } from "../auth/people-queries.js";
import { useChangeShare, useShares, type ShareChoice } from "./share-queries.js";
import { useTranslate } from "../app/language-context.js";

export interface ShareUnitSheetProps {
  readonly unit: StorageUnitView;
  /** Whose tree the space is in: they already change it, so they are not listed. */
  readonly ownerId: string | null;
  readonly onClose: () => void;
}

/**
 * # Who this space is shared with, and how far (ADR 26)
 *
 * An administrator's sheet, the browser's Share dialog in the phone's own
 * sheet. Everybody a share would mean something to is listed, in the People
 * group's order — every active person but administrators, who see
 * everything, and the space's owner, who already changes it — each with three
 * answers. An answer is saved the moment it is chosen: there is nothing to
 * confirm, so the sheet has no primary and the X is the way out (ADR 22).
 *
 * Only shares placed on THIS space are shown. One placed above it covers it
 * too and is changed there; the line at the top says so the other way round.
 */
export const ShareUnitSheet = ({ unit, ownerId, onClose }: ShareUnitSheetProps): JSX.Element => {
  const t = useTranslate();
  const styles = useStyles();

  const accounts = useAccounts(true);
  const shares = useShares(unit.id);

  const people = (accounts.data?.accounts ?? []).filter(
    (account) =>
      account.role !== Role.ADMINISTRATOR && account.disabledAt === null && account.id !== ownerId,
  );
  const levelOf = (accountId: string): ShareChoice =>
    shares.data?.shares.find((share) => share.account.id === accountId)?.access ?? "none";

  const failed = accounts.isError ? accounts.error : shares.isError ? shares.error : null;
  const ready = accounts.isSuccess && shares.isSuccess;

  return (
    <Sheet title={t("share.title", { name: unit.name })} onClose={onClose}>
      <View style={styles.block}>
        <Text style={styles.text}>{t("share.cascades")}</Text>

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

        {ready && people.length === 0 ? <Text style={styles.text}>{t("share.nobody")}</Text> : null}

        {ready
          ? people.map((person) => (
              <PersonShare key={person.id} unit={unit} person={person} level={levelOf(person.id)} />
            ))
          : null}
      </View>
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
  const styles = useStyles();
  const change = useChangeShare(unit.id);

  // While the answer is on its way it is already the answer; a refusal puts
  // back what the list says once it is fetched again.
  const shown = change.isPending ? change.variables.choice : level;

  return (
    <View style={styles.person}>
      <SettingRow icon="person" label={person.username}>
        <Segmented<ShareChoice>
          label={person.username}
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
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    block: { gap: space.s3 },
    person: { gap: space.s2 },
    text: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
  }),
);
