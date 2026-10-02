import type { FlatUnit } from "@waymark/api-client";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTranslate } from "../../app/language-context.js";
import { Checkbox } from "../../ui/atoms/checkbox.js";
import { space, text } from "../../ui/styles/tokens.js";
import { themed } from "../../ui/styles/theme.js";

export interface SpaceChoiceProps {
  /** Every space the person can see, in the tree's order. */
  readonly spaces: readonly FlatUnit[];
  readonly chosen: readonly string[];
  readonly onToggle: (spaceId: string) => void;
}

/**
 * The spaces a new machine token may see (ADR 26): a row to tick per space
 * the person can see, each labelled by where it is, because a house has three
 * boxes called `Box 3`. The same flattened tree the move sheets offer, as
 * ticks rather than one choice, and as rows rather than a wheel, for the
 * reason `OptionList` gives.
 *
 * Presentational: it is handed the spaces and what is ticked, and says when
 * something is toggled. Ticking a space inside another ticked one adds
 * nothing, and the API keeps only the outer one.
 */
export const SpaceChoice = ({ spaces, chosen, onToggle }: SpaceChoiceProps): JSX.Element => {
  const styles = useStyles();
  const t = useTranslate();

  return (
    <View style={styles.wrap} accessibilityLabel={t("tokens.spacesLabel")}>
      <Text style={styles.label}>{t("tokens.spacesLabel")}</Text>
      <Text style={styles.hint}>{t("tokens.spacesHint")}</Text>
      {spaces.map((entry) => (
        <Checkbox
          key={entry.unit.id}
          label={entry.location}
          checked={chosen.includes(entry.unit.id)}
          onPress={() => {
            onToggle(entry.unit.id);
          }}
        />
      ))}
      {chosen.length === 0 ? <Text style={styles.hint}>{t("tokens.chooseASpace")}</Text> : null}
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    wrap: { gap: space.s1 },
    label: { color: colors.ink, fontSize: text.s, fontWeight: "600" },
    hint: { color: colors.inkMuted, fontSize: text.s },
  }),
);
