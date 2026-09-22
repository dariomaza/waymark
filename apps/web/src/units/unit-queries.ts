import {
  queryKeys,
  type StorageUnitDetailResponse,
  type StorageUnitTreeResponse,
} from "@waymark/api-client";
import type { UnitId } from "@waymark/domain";
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
