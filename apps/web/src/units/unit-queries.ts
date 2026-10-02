import {
  findTreeNode,
  queryKeys,
  type SpacePermissionsView,
  type StorageUnitDetailResponse,
  type StorageUnitTreeResponse,
} from "@waymark/api-client";
import { ShareLevel, type UnitId } from "@waymark/domain";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";

/**
 * The whole forest in one request, which is what the API answers with.
 *
 * It is the navigation for every screen and it is small — a house is tens of
 * units, not thousands (ADR 1) — so it is fetched whole and shaped in memory,
 * exactly as the API itself decided to do for search scoping.
 */
export const useStorageUnitTree = (): UseQueryResult<StorageUnitTreeResponse, Error> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.tree(),
    queryFn: async () => await api.tree(),
  });
};

/** One unit, its breadcrumb, its children and its items: one screen. */
export const useStorageUnit = (
  id: UnitId,
): UseQueryResult<StorageUnitDetailResponse, Error> => {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.unit(id),
    queryFn: async () => await api.unit(id),
  });
};

/**
 * # What the person may do with one space (ADR 26)
 *
 * Read off the tree, which already says it for every node and is already in
 * the cache, rather than off the unit's own answer, which does not carry it.
 *
 * `null` while the tree is not known yet: nothing is offered on a guess,
 * because a button that appears and then vanishes is worse than one that
 * arrives a moment late. A space missing from a tree that has loaded is one
 * made a moment ago and not fetched again yet; only its owner can be standing
 * on it, so it is treated as theirs, and the API still says no if it is not.
 */
export const useSpacePermissions = (id: UnitId): SpacePermissionsView | null => {
  const tree = useStorageUnitTree();

  if (tree.data === undefined) {
    return null;
  }

  return findTreeNode(tree.data.tree, id)?.permissions ?? OWNERS_OWN;
};

const OWNERS_OWN: SpacePermissionsView = {
  access: ShareLevel.EDIT,
  mayMove: true,
  mayMoveToTop: true,
};

/** Whether anything in this space may be changed: added, edited, moved, removed. */
export const useMayChange = (id: UnitId): boolean =>
  useSpacePermissions(id)?.access === ShareLevel.EDIT;
