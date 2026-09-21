import { kindLabel, type StorageUnitTreeView } from "@ariadna/api-client";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

import { RowLink } from "../../ui/molecules/row-link.js";
import { space } from "../../ui/styles/tokens.js";

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
export const UnitTree = ({ nodes, onOpen, depth = 0 }: UnitTreeProps): JSX.Element => (
  <View style={styles.level}>
    {nodes.map((node) => (
      <View key={node.id} style={[styles.branch, { marginLeft: depth * space.s3 }]}>
        <RowLink
          title={node.name}
          detail={kindLabel(node.kind)}
          onPress={() => {
            onOpen(node.id);
          }}
        />
        {node.children.length === 0 ? null : (
          <UnitTree nodes={node.children} onOpen={onOpen} depth={depth + 1} />
        )}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  level: { gap: space.s2 },
  branch: { gap: space.s2 },
});
