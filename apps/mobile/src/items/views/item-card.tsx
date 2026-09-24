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
  /**
   * Picking mode: this card is a tick box rather than a way in.
   *
   * It is a PROP and not something this card works out, for the same reason
   * `secondary` is: a card that decided for itself which screen it was on
   * would grow a branch per screen. What changes is the ROLE it announces and
   * what a tap does — both of which are the screen's decision, taken once for
   * the whole grid.
   */
  readonly picking?: boolean;
  readonly selected?: boolean;
  /**
   * Held down. The gesture that starts picking on this platform, offered on
   * every card rather than on a handle, because a handle on a photograph is a
   * target the thumb covers.
   */
  readonly onLongPress?: (() => void) | undefined;
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
  picking = false,
  selected = false,
  onLongPress,
}: ItemCardProps): JSX.Element => {
  const line = secondary === undefined || secondary === "" ? undefined : secondary;

  return (
    <Pressable
      /*
       * A link when a tap opens a thing, a tick box when a tap ticks one.
       * Saying "link" while a tap ticks would be the drawing and the
       * announcement disagreeing about what the card IS — which is exactly
       * the disagreement a screen reader cannot see past.
       */
      role={picking ? "checkbox" : "link"}
      accessibilityLabel={label ?? (line === undefined ? name : `${name}, ${line}`)}
      accessibilityState={picking ? { checked: selected } : {}}
      onPress={onPress}
      {...(onLongPress === undefined ? {} : { onLongPress })}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={[styles.image, selected ? styles.picked : null]}>
        {photo ?? (
          /**
           * Not a spinner and not an icon: the initials say WHICH thing this
           * is while saying it has no picture — the state most of a new
           * inventory is in. They are inside the button's own label, so they
           * are never announced before the name they abbreviate.
           */
          <Text style={styles.initials}>{initialsOf(name)}</Text>
        )}
        {selected ? (
          /**
           * The tick sits where the quantity badge sits, and the two never
           * appear together: while picking, how many of a thing there are is
           * not the question being asked.
           *
           * Not translated, and not a gap in the translation: `✓` is a symbol
           * with no word in it, the same way `×8` is. What it MEANS is said
           * in words by the card's own accessible state, which is where a
           * screen reader hears it.
           */
          <View style={styles.tick}>
            <Text style={styles.tickMark}>✓</Text>
          </View>
        ) : quantity === undefined || quantity <= 1 ? null : (
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
  /**
   * `sunken`, not `raised`. This is the one row of the cross-client audit where
   * THIS client moved rather than the browser (ADR 22): a photo's backing is
   * the recess token everywhere else in this product — a field, an option list
   * — and this app's own `TextField` uses it for exactly that. A tile here was
   * this file breaking a rule the rest of the app keeps.
   *
   * It shows most in the state most of a new inventory is in: forty cells with
   * no photograph yet, which read as holes waiting for a picture rather than as
   * forty raised tiles with letters on them.
   */
  image: {
    aspectRatio: 1,
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: { color: colors.inkMuted, fontSize: text.xl, fontWeight: "700" },
  /**
   * The picked state is drawn on the PHOTO's box rather than around the whole
   * card, so the name underneath keeps its position — a border that appeared
   * around the card would shift every name in the row by a pixel as things
   * are ticked.
   */
  picked: { borderWidth: 3, borderColor: colors.accent },
  tick: {
    position: "absolute",
    top: space.s1,
    right: space.s1,
    width: 24,
    height: 24,
    borderRadius: radius.m,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  tickMark: { color: colors.accentInk, fontSize: text.s, fontWeight: "700" },
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
