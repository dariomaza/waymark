import { THEME_CHOICES, type ThemeChoice } from "@waymark/tokens";
import type { JSX } from "react";

import type { IconName } from "../ui/atoms/icon.js";
import { Segmented } from "../ui/atoms/segmented.js";
import { SettingRow } from "../ui/molecules/setting-row.js";
import { useTranslate } from "./language-context.js";
import { useThemeChoice } from "./theme-context.js";

/** Each answer's drawing: the phone's own is both at once. */
const DRAWN: Readonly<Record<ThemeChoice, IconName>> = {
  system: "sunMoon",
  light: "sun",
  dark: "moon",
};

/**
 * # How the app looks: the phone's scheme, the light, or the dark (ADR 25)
 *
 * A setting, not an action, so it is three answers and not a button (ADR 21):
 * one of them is always the answer. Drawn by `Segmented`, the same control the
 * language uses: the answers are pictures, and each picture's word is its name
 * aloud.
 *
 * The browser draws the same three, in the same order, with the same pictures.
 */
export const ThemeSwitcher = (): JSX.Element => {
  const { choice, choose } = useThemeChoice();
  const t = useTranslate();

  return (
    <SettingRow icon="sunMoon" label={t("appearance.label")}>
      <Segmented<ThemeChoice>
        label={t("appearance.label")}
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
