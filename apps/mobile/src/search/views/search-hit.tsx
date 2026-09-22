import { SearchMatchField } from "@waymark/domain";
import type { MessageKey, Translate } from "@waymark/i18n";
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, TAP_TARGET, text } from "../../ui/styles/tokens.js";
import { useTranslate } from "../../app/language-context.js";

export interface SearchHitProps {
  readonly title: string;
  /** `Garage > Metal wardrobe > Box 3`, already joined by the API. */
  readonly location: string;
  readonly matchedFields: readonly SearchMatchField[];
  readonly detail?: string | undefined;
  readonly onPress: () => void;
}

export const FIELD_KEYS = {
  [SearchMatchField.NAME]: "search.field.name",
  [SearchMatchField.TAG]: "search.field.tag",
  [SearchMatchField.DESCRIPTION]: "search.field.description",
} as const satisfies Readonly<Record<SearchMatchField, MessageKey>>;

/**
 * Why a result is here at all, in words.
 *
 * Lives here and is shared with the grid of item cards, which says the same
 * thing in its accessible name — two spellings of "matched tag" would be two
 * chances for one of them to stop matching the field it names.
 */
export const whyItMatched = (t: Translate, fields: readonly SearchMatchField[]): string =>
  t("search.matchedLower", { fields: fields.map((field) => t(FIELD_KEYS[field])).join(", ") });

/** Sentence case, for the line that starts one rather than ending a label. */
const capitalised = (sentence: string): string =>
  `${sentence.slice(0, 1).toLocaleUpperCase()}${sentence.slice(1)}`;

/**
 * One answer to "where is my stuff".
 *
 * The breadcrumb is the result, not a decoration on it: "you own a cordless
 * drill" is something the person already knew. It is shown as the joined
 * `location` the API sends, because a result row is read at a glance.
 *
 * `matchedFields` says why this is here at all. An item called `HDMI 2.1`
 * answering a search for `cables` looks like a mistake until the row says
 * "matched tag", and then it looks like the feature working.
 */
export const SearchHit = ({
  title,
  location,
  matchedFields,
  detail,
  onPress,
}: SearchHitProps): JSX.Element => {
  const t = useTranslate();

  return (
    <Pressable
      role="link"
      accessibilityLabel={`${title}, ${location}`}
      onPress={onPress}
      style={styles.hit}
    >
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.where}>{location}</Text>
        <Text style={styles.why}>
          {capitalised(whyItMatched(t, matchedFields))}
          {detail === undefined ? "" : ` · ${detail}`}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  hit: {
    minHeight: TAP_TARGET,
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.m,
    padding: space.s3,
  },
  title: { color: colors.ink, fontSize: text.m, fontWeight: "600" },
  where: { color: colors.accent, fontSize: text.s },
  why: { color: colors.inkMuted, fontSize: text.s },
});
