import { Children, Fragment, useState, type JSX, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../atoms/button.js";
import { radius, space, text } from "../styles/tokens.js";
import { themed } from "../styles/theme.js";

export interface SettingsGroupProps {
  /** The small uppercase title, announced as a heading. */
  readonly title: string;
  /**
   * The sentences that explain the group, folded behind an ⓘ beside the
   * title. Left out, there is no ⓘ.
   */
  readonly about?: readonly string[] | undefined;
  /** The ⓘ's name: "More about Security". Needed whenever `about` is given. */
  readonly aboutLabel?: string | undefined;
  /** The group's one way to add a row, as an icon at the end of the title line. */
  readonly action?: ReactNode;
  /**
   * What is said ABOUT the group rather than drawn as one of its rows — a
   * refusal, a secret shown once. Between the title and the card.
   */
  readonly notes?: ReactNode;
  /** The rows. Each child is one row; a hairline is drawn between them. */
  readonly children: ReactNode;
}

/**
 * # A group of settings: a small title, then one card of rows
 *
 * The browser's `ui/molecules/settings-group.tsx`, and the shape both phones'
 * own settings screens are made of: a small uppercase title, and under it ONE
 * raised card whose rows are divided by hairlines — not a floating card per
 * item, and not a big heading with a paragraph under it.
 *
 * The explanation is behind an ⓘ beside the title, so the screen reads as
 * rows, and the group's one way to add a row is an icon at the end of the
 * same line. React Native has no sibling selector, so the hairlines are drawn
 * here, between the children, rather than by each row.
 */
export const SettingsGroup = ({
  title,
  about,
  aboutLabel,
  action,
  notes,
  children,
}: SettingsGroupProps): JSX.Element => {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const rows = Children.toArray(children);

  return (
    <View style={styles.group}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {about === undefined ? null : (
          <Button
            tone="quiet"
            icon="info"
            label={aboutLabel}
            onPress={() => {
              setOpen(!open);
            }}
          />
        )}
        <View style={styles.end}>{action}</View>
      </View>
      {about === undefined || !open ? null : (
        <View style={styles.about}>
          {about.map((sentence) => (
            <Text key={sentence} style={styles.sentence}>
              {sentence}
            </Text>
          ))}
        </View>
      )}
      {notes}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={styles.hairline} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
};

const useStyles = themed((colors) =>
  StyleSheet.create({
    group: { gap: space.s1, alignSelf: "stretch" },
    // Shorter than the buttons on it, which overhang it, so the title sits
    // close over its card while every button keeps the 48 a thumb needs.
    head: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 32,
      paddingLeft: space.s4,
      marginVertical: -space.s2,
    },
    title: {
      color: colors.inkMuted,
      fontSize: text.xs,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    end: { marginLeft: "auto", flexDirection: "row" },
    about: { gap: space.s1, paddingHorizontal: space.s4, paddingBottom: space.s2 },
    sentence: { color: colors.inkMuted, fontSize: text.s, lineHeight: 20 },
    card: {
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radius.m,
      overflow: "hidden",
    },
    hairline: { height: 1, backgroundColor: colors.line },
  }),
);
