import { type StorageUnitTreeView } from "@waymark/api-client";
import { ShareLevel } from "@waymark/domain";
import { kindLabel } from "@waymark/i18n";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "../../ui/atoms/icon.js";
import { RowLink } from "../../ui/molecules/row-link.js";
import { space } from "../../ui/styles/tokens.js";
import { useColors } from "../../ui/styles/theme.js";
import { useTranslate } from "../../app/language-context.js";

export interface UnitTreeProps {
  readonly nodes: readonly StorageUnitTreeView[];
  readonly onOpen: (id: string) => void;
  readonly depth?: number;
}

/**
 * Presentational. The forest, nested, one tappable row per unit.
 *
 * Indented rather than collapsible: a house is four or five levels deep
 * (ADR 1), and a disclosure triangle on every row would be a tap to find out
 * there was nothing behind it.
 */
export const UnitTree = ({ nodes, onOpen, depth = 0 }: UnitTreeProps): JSX.Element => {
  const t = useTranslate();
  const colors = useColors();

  return (
    <View style={styles.level}>
      {nodes.map((node) => (
        <View key={node.id} style={[styles.branch, { marginLeft: depth * space.s3 }]}>
          <RowLink
            title={node.name}
            detail={kindLabel(t, node.kind)}
            onPress={() => {
              onOpen(node.id);
            }}
            /*
              Shared to look at and not to change (ADR 26): an eye, named, so
              the missing buttons inside are not a surprise.
            */
            {...(node.permissions.access === ShareLevel.VIEW
              ? {
                  leading: (
                    <Icon name="eye" size={18} color={colors.inkMuted} label={t("units.viewOnly")} />
                  ),
                }
              : {})}
          />
          {node.children.length === 0 ? null : (
            <UnitTree nodes={node.children} onOpen={onOpen} depth={depth + 1} />
          )}
        </View>
      ))}
    </View>
);
};

const styles = StyleSheet.create({
  level: { gap: space.s2 },
  branch: { gap: space.s2 },
});
