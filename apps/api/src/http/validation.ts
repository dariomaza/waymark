import { MAX_ITEM_PHOTOS, StorageUnitKind } from "@ariadna/domain";
import { z } from "zod";

/**
 * # Where validation stops and the domain begins
 *
 * This layer checks SHAPE: is the field there, is it a string, is it a number,
 * is it short enough to be worth parsing. It deliberately does NOT check rules.
 *
 * The clearest case is `quantity`. The domain says a quantity is an integer of
 * at least one and raises `InvalidQuantity` when it is not. This schema only
 * checks that it is a number, so `0` reaches the domain, is refused there, and
 * comes back as a 422. Re-stating "integer, minimum one" here would create a
 * second copy of the rule that can drift from the first, and would turn a
 * domain invariant into a transport concern.
 *
 * What DOES belong here:
 *
 * - Presence and JSON type of every field.
 * - `kind`, because `StorageUnitKind` is a TypeScript union with no runtime
 *   check in the domain. Without this, an unknown kind would be stored and blow
 *   up on the way back OUT, as a 500, on a completely unrelated request.
 * - Unknown keys are rejected rather than ignored: a client sending `ownerId`
 *   has misunderstood the product and deserves to be told.
 * - Length caps, which are a transport concern. They are generous enough that
 *   no honest request meets them and small enough that a hostile one cannot
 *   turn a text column into a memory problem.
 */

const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_TAG_LENGTH = 50;
const MAX_TAGS = 50;
/**
 * The domain's cap, not a second one. `MAX_ITEM_PHOTOS` is a rule about an
 * item, and restating the number here is exactly how the two get to disagree;
 * importing it keeps the transport check and the invariant the same fact.
 */
const MAX_PHOTOS = MAX_ITEM_PHOTOS;
const MAX_BATCH_SIZE = 500;
/**
 * Long enough for any sentence somebody would type into a search box, short
 * enough that the query cannot become a way to make the tokenizer work.
 */
const MAX_SEARCH_QUERY_LENGTH = 200;
/**
 * The most results one request may ask for. A cap and not a clamp: silently
 * answering 100 to a request for 5000 is a lie about what came back.
 */
export const MAX_SEARCH_LIMIT = 100;
const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 1_024;

const id = z.string().min(1).max(MAX_ID_LENGTH);
const name = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const description = z.string().max(MAX_DESCRIPTION_LENGTH).nullish();

const kinds = Object.values(StorageUnitKind) as [
  StorageUnitKind,
  ...StorageUnitKind[],
];
const kind = z.enum(kinds);

export const idParamsSchema = z.strictObject({ id });

export const itemPhotoParamsSchema = z.strictObject({ id, photoId: id });

/**
 * The COMPLETE list, in the wanted order; the first one becomes the cover.
 * That a subset is refused is a domain rule (`reorderItemPhotos`), not a shape
 * rule, so it is not restated here.
 */
export const reorderItemPhotosBodySchema = z.strictObject({
  photoIds: z.array(id).max(MAX_PHOTOS),
});

export const loginBodySchema = z.strictObject({
  username: z.string().min(1).max(MAX_USERNAME_LENGTH),
  // Not capped at the bottom: "your password is too short" is a rule for
  // whoever creates the account, not a hint for whoever is guessing it.
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export const createStorageUnitBodySchema = z.strictObject({
  parentId: id.nullish(),
  name,
  kind,
  description,
  photoId: id.nullish(),
});

/**
 * `parentId` is required and may be `null`. Absent and `null` are different
 * requests: one forgot the field, the other means "make this a root".
 */
export const moveStorageUnitBodySchema = z.strictObject({
  parentId: id.nullable(),
});

export const emptyStorageUnitBodySchema = z.strictObject({
  targetUnitId: id.optional(),
});

export const createItemBodySchema = z.strictObject({
  storageUnitId: id,
  name,
  description,
  /** A number, and nothing more. `InvalidQuantity` is the domain's to raise. */
  quantity: z.number().optional(),
  tags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS).optional(),
  photos: z.array(id).max(MAX_PHOTOS).optional(),
});

/**
 * A query string, so every value arrives as text and `limit` is coerced.
 *
 * `q` is required and may be empty: "the box is empty" and "there is no box"
 * are different requests, and a search page that has not been typed into yet
 * is the first of the two. An empty `q` answers with no results rather than
 * with the whole inventory.
 */
export const searchQuerySchema = z.strictObject({
  q: z.string().max(MAX_SEARCH_QUERY_LENGTH),
  within: id.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
});

export const moveItemsBodySchema = z.strictObject({
  itemIds: z.array(id).max(MAX_BATCH_SIZE),
  targetUnitId: id,
});

export interface ValidationIssue {
  /** Dotted path to the offending field, `""` for the body itself. */
  readonly path: string;
  readonly message: string;
}

export const toValidationIssues = (error: z.ZodError): ValidationIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
