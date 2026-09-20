import type {
  CreateItemInput,
  ItemResponse,
  MovedItemsResponse,
  ReleasedPhotosResponse,
  UpdateItemInput,
} from "@ariadna/api-client";
import type { ItemId, UnitId } from "@ariadna/domain";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useApi } from "../api/api-context.js";
import { useInvalidateInventory } from "../api/use-invalidate-inventory.js";

export const useCreateItem = (): UseMutationResult<ItemResponse, Error, CreateItemInput> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (input: CreateItemInput) => await api.createItem(input),
    onSuccess: invalidate,
  });
};

/**
 * Changing what an item SAYS about itself: its name, its description, how
 * many there are, its tags.
 *
 * Tags go in whole. That is the API's shape and it is the only one that can
 * take a mistyped tag OFF — and a tag is the entire reason searching
 * `cables` finds an item called `HDMI 2.1`.
 *
 * Not where it is: moving is `useMoveItems`, which is all or nothing (ADR 3).
 */
export const useUpdateItem = (
  id: ItemId,
): UseMutationResult<ItemResponse, Error, UpdateItemInput> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (changes: UpdateItemInput) => await api.updateItem(id, changes),
    onSuccess: invalidate,
  });
};

export interface MoveItemsCommand {
  readonly itemIds: readonly ItemId[];
  readonly targetUnitId: UnitId;
}

/**
 * One call for one item and for forty.
 *
 * `POST /items/move` is all or nothing by design (ADR 3): one unknown id
 * rejects the whole batch, rather than leaving half an inventory moved. So
 * there is no loop here either — moving one item is a batch of one.
 */
export const useMoveItems = (): UseMutationResult<
  MovedItemsResponse,
  Error,
  MoveItemsCommand
> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async (command: MoveItemsCommand) =>
      await api.moveItems(command.itemIds, command.targetUnitId),
    onSuccess: invalidate,
  });
};

/**
 * Deleting an item is unconditional — unlike a unit, an item holds nothing —
 * and the API answers with the photo files it released, which it has already
 * deleted by the time the response arrives.
 */
export const useDeleteItem = (
  id: ItemId,
): UseMutationResult<ReleasedPhotosResponse, Error, void> => {
  const api = useApi();
  const invalidate = useInvalidateInventory();

  return useMutation({
    mutationFn: async () => await api.deleteItem(id),
    onSuccess: invalidate,
  });
};
