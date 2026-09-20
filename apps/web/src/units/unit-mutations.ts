import type { UnitId } from "@ariadna/domain";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import type { CreateStorageUnitInput, EmptyStorageUnitResponse, StorageUnitResponse, UpdateStorageUnitInput } from "@ariadna/api-client";
import { useInvalidateInventory } from "../api/use-invalidate-inventory.js";

export const useCreateUnit = (): UseMutationResult<
  StorageUnitResponse,
  Error,
  CreateStorageUnitInput
> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (input: CreateStorageUnitInput) => await api.createUnit(input),
    onSuccess: invalidate,
  });
};

/**
 * Changing what a unit SAYS about itself: its name, its kind, its description.
 *
 * Not where it is. The API refuses a `parentId` on this route, and a client
 * that tried to slip one in would get a 400 naming the key rather than a
 * silent no-op — which is the right way round, because a box that did not
 * move while the screen said it did is the failure this product cannot have.
 */
export const useUpdateUnit = (
  id: UnitId,
): UseMutationResult<StorageUnitResponse, Error, UpdateStorageUnitInput> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (changes: UpdateStorageUnitInput) =>
      await api.updateUnit(id, changes),
    onSuccess: invalidate,
  });
};

/**
 * Whether a move is legal is the domain's decision, not this app's (ADR 2).
 * The picker therefore offers every unit in the house, including the ones
 * that would make a cycle, and the API's refusal is what the screen shows.
 * Re-implementing the subtree rule here would be a second copy of an
 * invariant — and the copy that is wrong is always the one in the client.
 */
export const useMoveUnit = (
  id: UnitId,
): UseMutationResult<StorageUnitResponse, Error, UnitId | null> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (parentId: UnitId | null) => await api.moveUnit(id, parentId),
    onSuccess: invalidate,
  });
};

/**
 * Emptying moves everything one level up, or into a unit named explicitly.
 * A root has nowhere to go, and the API says so with `MISSING_EMPTY_TARGET`;
 * the screen asks for a target before it gets there.
 */
export const useEmptyUnit = (
  id: UnitId,
): UseMutationResult<EmptyStorageUnitResponse, Error, UnitId | undefined> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (targetUnitId: UnitId | undefined) =>
      await api.emptyUnit(id, targetUnitId),
    onSuccess: invalidate,
  });
};

export const useDeleteUnit = (id: UnitId): UseMutationResult<void, Error, void> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async () => {
      await api.deleteUnit(id);
    },
    onSuccess: invalidate,
  });
};

/**
 * The two calls ADR 3 turns "empty then delete" into, as one action.
 *
 * The domain refuses to cascade — you do not throw away a full box, you empty
 * it first — and it hands clients the tooling to satisfy that rule. This is
 * that tooling, spelled as the one thing the person actually wants.
 */
export const useEmptyAndDeleteUnit = (
  id: UnitId,
): UseMutationResult<void, Error, UnitId | undefined> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (targetUnitId: UnitId | undefined) => {
      await api.emptyUnit(id, targetUnitId);
      await api.deleteUnit(id);
    },
    onSuccess: invalidate,
  });
};
