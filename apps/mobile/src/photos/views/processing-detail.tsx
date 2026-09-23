import type { PhotoProcessingResponse } from "@waymark/api-client";
import { PhotoProcessingStatus } from "@waymark/domain";
import type { Translate } from "@waymark/i18n";
import type { JSX, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Callout } from "../../ui/atoms/callout.js";
import { EmptyNote } from "../../ui/molecules/empty-note.js";
import { colors, radius, space, text } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface ProcessingDetailProps {
  readonly processing: PhotoProcessingResponse;
  /** The bulk retry, when there is anything to retry. Injected. */
  readonly bulkRetry?: ReactNode;
  /** Rendered on each abandoned row; the retry for that one photo. */
  readonly rowAction?: (photoId: string) => ReactNode;
}

/**
 * # What background removal is doing
 *
 * Purely presentational: it says what the API answered and draws the buttons
 * it was handed. It has no idea that a retry can fail, which is why the
 * container above can grow that without touching this.
 *
 * The first sentence is the one that matters, and it has three forms rather
 * than two. "Switched off" is not a fault: with no sidecar configured there
 * is no processor, no worker and no timer, every photo sits at `PENDING` for
 * ever, and that is a complete installation (ADR 4). Saying "unreachable"
 * there would report a problem nobody has.
 */
export const ProcessingDetail = ({
  processing,
  bulkRetry,
  rowAction,
}: ProcessingDetailProps): JSX.Element => {
  const t = useTranslate();

  const { processor, counts, abandoned } = processing;
  const failed = counts[PhotoProcessingStatus.FAILED];
  const states = stateLabels(t);

  return (
    <>
      <Callout tone={processor.reachable === false ? "blocked" : "note"}>
        <Text style={styles.sentence}>
          {processor.enabled
            ? processor.reachable === false
              ? t("photos.processorUnreachable")
              : t("photos.processorOn")
            : t("photos.processorOff")}
        </Text>
        {processor.url === null ? null : (
          <Text style={styles.address}>{processor.url}</Text>
        )}
      </Callout>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          {t("photos.states")}
        </Text>
        <View style={styles.counts} accessibilityLabel={t("photos.states")}>
          {Object.values(PhotoProcessingStatus).map((status) => (
            <View key={status} style={styles.count}>
              {/*
                The number above the word, big. On a phone this block is read
                at a glance from across a room — which is the whole use for it
                — and a number the same size as its label is not.
              */}
              <Text style={styles.number}>{counts[status]}</Text>
              <Text style={styles.state}>{states[status]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          {t("photos.givenUpOn")}
        </Text>

        {failed === 0 ? (
          <EmptyNote>{t("photos.nothingFailed")}</EmptyNote>
        ) : (
          <>
            <Text style={styles.failedCount}>{t("photos.failedCount", { count: failed })}</Text>
            {bulkRetry}
          </>
        )}

        {abandoned.length === 0 ? null : (
          <View style={styles.rows} accessibilityLabel={t("photos.givenUpOn")}>
            {abandoned.map((entry) => (
              <View key={entry.photoId} style={styles.row}>
                <Text style={styles.photoId}>{entry.photoId}</Text>
                <Text style={styles.reason}>{entry.lastError}</Text>
                <Text style={styles.spent}>
                  {t("photos.attempts", { count: entry.attempts })}
                  {t("photos.lastOn", { when: whenItStopped(entry.lastAttemptAt) })}
                </Text>
                {rowAction?.(entry.photoId)}
              </View>
            ))}
          </View>
        )}

        {/*
          The list is a bounded SAMPLE and the count above it is the truth.
          Somebody reading two rows under a number that says nine has to be
          told which of the two to believe.
        */}
        {abandoned.length > 0 && abandoned.length < failed ? (
          <Text style={styles.sample}>
            {t("photos.showingSome", { count: abandoned.length })}
          </Text>
        ) : null}
      </View>
    </>
  );
};

/**
 * The moment the last attempt was made, to the minute.
 *
 * Not localised, deliberately, and this is the one place in the app where
 * that is the right answer: it is a log line. Whoever is reading it is about
 * to go and look at the sidecar's own output, which is in UTC and in this
 * shape, and a date rendered as `2 May 2026` would have to be converted back
 * by hand before it could be matched against anything.
 */
const whenItStopped = (moment: string): string =>
  new Date(moment).toISOString().slice(0, 16).replace("T", " ");

/**
 * Said the way somebody standing outside this feature would say it.
 *
 * A function of the translator rather than a constant: the words are not
 * knowable until a language is, and a table built once at import time would
 * be built in whichever language loaded first.
 */
const stateLabels = (t: Translate): Readonly<Record<PhotoProcessingStatus, string>> => ({
  [PhotoProcessingStatus.PENDING]: t("photos.waiting"),
  [PhotoProcessingStatus.DONE]: t("photos.removed"),
  [PhotoProcessingStatus.FAILED]: t("photos.givenUpOn"),
  [PhotoProcessingStatus.SKIPPED]: t("photos.nothingToRemove"),
});

const styles = StyleSheet.create({
  sentence: { color: colors.ink, fontSize: text.m, lineHeight: 22 },
  address: { color: colors.inkMuted, fontFamily: "monospace", fontSize: text.s },
  section: { gap: space.s2 },
  heading: { color: colors.ink, fontSize: text.l, fontWeight: "700" },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  count: {
    flexGrow: 1,
    flexBasis: "45%",
    gap: space.s1,
    padding: space.s3,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceRaised,
  },
  number: { color: colors.ink, fontSize: text.xl, fontWeight: "700" },
  state: { color: colors.inkMuted, fontSize: text.s },
  failedCount: { color: colors.ink, fontSize: text.m },
  rows: { gap: space.s2 },
  row: {
    gap: space.s1,
    padding: space.s3,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "flex-start",
  },
  photoId: { color: colors.ink, fontFamily: "monospace", fontSize: text.s, fontWeight: "700" },
  reason: { color: colors.danger, fontSize: text.s, lineHeight: 20 },
  spent: { color: colors.inkMuted, fontSize: text.s },
  sample: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
});
