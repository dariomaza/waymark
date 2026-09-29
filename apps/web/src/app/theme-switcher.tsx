import { THEME_CHOICES, type ThemeChoice } from "@waymark/tokens";
import { useId, type JSX } from "react";

import type { IconName } from "../ui/atoms/icon.js";
import { Segmented } from "../ui/atoms/segmented.js";
import { SettingRow } from "../ui/molecules/setting-row.js";
import { useTranslate } from "./language-context.js";
import { useThemeChoice } from "./theme-context.js";

/** Each answer's drawing: the device's own is both at once. */
const DRAWN: Readonly<Record<ThemeChoice, IconName>> = {
  system: "sunMoon",
  light: "sun",
  dark: "moon",
};

/**
 * # How the app looks: the device's scheme, the light, or the dark (ADR 25)
 *
 * A setting, not an action, so it is three radios and not a button (ADR 21):
 * one of them is always the answer. Drawn by `Segmented`, the same control the
 * language uses, so the two are one shape: the answers are pictures, and each
 * picture's word is its name aloud — three words in a row were what made this
 * control wider than the other.
 *
 * The phone draws the same three, in the same order, with the same pictures.
 */
export const ThemeSwitcher = (): JSX.Element => {
  const { choice, choose } = useThemeChoice();
  const t = useTranslate();
  const labelId = useId();

  return (
    <SettingRow icon="sunMoon" label={t("appearance.label")} labelId={labelId}>
      <Segmented<ThemeChoice>
        group="appearance"
        labelledBy={labelId}
        value={choice}
        onChoose={choose}
        options={THEME_CHOICES.map((option) => ({
          value: option,
          name: t(`appearance.${option}`),
          drawn: { icon: DRAWN[option] },
        }))}
      />
    </SettingRow>
  );
};
