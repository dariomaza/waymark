import { initialsOf } from "@waymark/api-client";
import type { JSX, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, text } from "../../ui/styles/tokens.js";

export interface ItemCardProps {
  readonly name: string;
  readonly onPress: () => void;
  /**
   * The one line a card has room for under the name, and it means different
   * things in different places: the tags inside a unit, where the location
   * would be the same string on every card; the box a thing is in, in search
   * and in everything-you-own, where each result is somewhere else.
   *
   * It is a PROP rather than a decision this card makes, because a card that
   * knows which screen it is on grows a branch per screen and then nobody can
   * say which one is live.
   */
  readonly secondary?: string | undefined;
  /** How many of it, when that is more than one. */
  readonly quantity?: number | undefined;
  /** The cover photo. Absent means there is none yet, not that it is loading. */
  readonly photo?: ReactNode;
  /**
   * What a screen reader should hear, when the short line cannot carry the
   * whole answer. In search the card shows the box a thing is in, but the full
   * breadcrumb and WHY the result matched are the answer — so that screen says
   * what it wants announced rather than dropping them on the floor.
   */
  readonly label?: string | undefined;
}

/**
 * One thing, as a square.
 *
 * A thing is recognised by its picture, which is the whole reason this is not
 * a row: a drawn box is the same drawing for a drill and for a bag of screws,
 * and the photograph is not.
 *
 * The picture's box is square and declared, with or without a photo. A
 * thumbnail here is an authenticated request that arrives late, and a box that
 * grew when the bytes landed would reflow the grid under a thumb already
 * reaching for a card.
 */
export const ItemCard = ({
  name,
  onPress,
  secondary,
  quantity,
  photo,
  label,
}: ItemCardProps): JSX.Element => {
  const line = secondary === undefined || secondary === "" ? undefined : secondary;

  return (
    <Pressable
      role="link"
      accessibilityLabel={label ?? (line === undefined ? name : `${name}, ${line}`)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.image}>
        {photo ?? (
          /**
           * Not a spinner and not an icon: the initials say WHICH thing this
           * is while saying it has no picture — the state most of a new
           * inventory is in. They are inside the button's own label, so they
           * are never announced before the name they abbreviate.
           */
          <Text style={styles.initials}>{initialsOf(name)}</Text>
        )}
        {quantity === undefined || quantity <= 1 ? null : (
          /**
           * Over the photo, not under the name. In a card the name is what
           * truncates, and "×8" is exactly the part that must not.
           */
          <View style={styles.quantity}>
            {/*
              * Not translated, and not a gap in the translation: "×8" is a
              * symbol and a digit. There is no word in it to say differently
              * in Spanish, and reaching for the translator here would cost
              * this card its independence from the provider — it is rendered
              * on its own in tests, which is what keeps it a card and not a
              * screen.
              */}
            <Text style={styles.quantityText}>{`×${String(quantity)}`}</Text>
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      {line === undefined ? null : (
        <Text style={styles.secondary} numberOfLines={1}>
          {line}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { gap: space.s1 },
  pressed: { opacity: 0.7 },
  image: {
    aspectRatio: 1,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: { color: colors.inkMuted, fontSize: text.xl, fontWeight: "700" },
  quantity: {
    position: "absolute",
    top: space.s1,
    right: space.s1,
    paddingHorizontal: space.s1,
    paddingVertical: 1,
    borderRadius: radius.s,
    // Opaque, because it sits on a photograph of unknown colour.
    backgroundColor: colors.surfaceSunken,
  },
  quantityText: { color: colors.ink, fontSize: text.s, fontWeight: "700" },
  name: { color: colors.ink, fontSize: text.s, fontWeight: "600" },
  secondary: { color: colors.inkMuted, fontSize: text.s },
});
