import { THEME_CHOICES, type ThemeChoice } from "@waymark/tokens";
import type { JSX } from "react";

import { Icon, type IconName } from "../ui/atoms/icon.js";
import { useTranslate } from "./language-context.js";
import { useThemeChoice } from "./theme-context.js";
import "./theme-switcher.css";

/** Each answer's drawing: the device's own is both at once. */
const DRAWN: Readonly<Record<ThemeChoice, IconName>> = {
  system: "sunMoon",
  light: "sun",
  dark: "moon",
};

/**
 * # How the app looks: the device's scheme, the light, or the dark (ADR 25)
 *
 * A setting, not an action, so it is a row of three radios and not a button
 * (ADR 21): one of them is always the answer. Real radios, as the language
 * switcher's are, so a keyboard and a screen reader get the grouping and the
 * current answer for free. Each is a word under a picture — three words that
 * fit, where the language switcher's two codes did not need them.
 *
 * The phone draws the same three, in the same order, with the same pictures.
 */
export const ThemeSwitcher = (): JSX.Element => {
  const { choice, choose } = useThemeChoice();
  const t = useTranslate();

  return (
    <fieldset className="theme-switcher">
      <legend className="theme-switcher__legend">{t("appearance.label")}</legend>
      <div className="theme-switcher__options">
        {THEME_CHOICES.map((option) => (
          <label key={option} className="theme-switcher__option">
            <input
              type="radio"
              name="appearance"
              value={option}
              checked={choice === option}
              onChange={() => {
                choose(option);
              }}
            />
            <Icon name={DRAWN[option]} size={20} />
            <span>{t(`appearance.${option}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};
