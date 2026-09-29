import type { JSX, ReactNode } from "react";

import { Icon, type IconName } from "../atoms/icon.js";
import "./setting-row.css";

export interface SettingRowProps {
  readonly icon: IconName;
  /** The setting's name, drawn once and naming its control too. */
  readonly label: string;
  /** The id the control points `aria-labelledby` at. */
  readonly labelId: string;
  /** The control. */
  readonly children: ReactNode;
}

/**
 * # One setting: its picture and name on the left, its control on the right
 *
 * The row a settings screen is made of, on both phones' own settings and on
 * both of this product's clients. The name is not a caption above the control
 * and not hidden inside it: it sits beside it, and it IS the control's name —
 * the control is labelled by these words rather than by a second copy of them.
 *
 * On a screen too narrow for both, the control drops under the name rather
 * than running off the edge. jsdom cannot show that; the wrap is asserted and
 * the width is looked at.
 */
export const SettingRow = ({ icon, label, labelId, children }: SettingRowProps): JSX.Element => (
  <div className="setting-row">
    <span className="setting-row__label">
      <Icon name={icon} size={20} />
      <span id={labelId}>{label}</span>
    </span>
    {children}
  </div>
);
