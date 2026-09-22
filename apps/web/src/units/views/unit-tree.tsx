import { type StorageUnitTreeView } from "@ariadna/api-client";
import { kindLabel } from "@ariadna/i18n";
import type { JSX } from "react";

import { useTranslate } from "../../app/language-context.js";
import { RowLink } from "../../ui/molecules/row-link.js";

import "./unit-tree.css";
import { unitPath } from "../../app/routes.js";

export interface UnitTreeProps {
  readonly nodes: readonly StorageUnitTreeView[];
}

/**
 * The house, nested the way it is stored.
 *
 * Presentational and recursive: it takes the forest the API sent and draws
 * it. No fetching, no state, no idea that a unit can be moved — which is why
 * it can be rendered in a test with three lines and no network at all.
 */
export const UnitTree = ({ nodes }: UnitTreeProps): JSX.Element => {
  const t = useTranslate();

  return (
    <ul className="unit-tree" aria-label={t("units.treeLabel")}>
      {nodes.map((node) => (
        <UnitTreeBranch key={node.id} node={node} />
      ))}
    </ul>
  );
};

const UnitTreeBranch = ({ node }: { readonly node: StorageUnitTreeView }): JSX.Element => {
  const t = useTranslate();

  return (
    <li className="unit-tree__branch">
      <RowLink to={unitPath(node.id)} title={node.name} meta={kindLabel(t, node.kind)} />
      {node.children.length === 0 ? null : (
        <ul className="unit-tree__children">
          {node.children.map((child) => (
            <UnitTreeBranch key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
};
