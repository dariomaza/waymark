/**
 * Nominal typing helper. The phantom property exists only at compile time, so a
 * branded id is a plain string at runtime and free to serialise.
 */
declare const brand: unique symbol;

type Branded<Name extends string> = string & { readonly [brand]: Name };

/** Identifies a storage unit. */
export type UnitId = Branded<"UnitId">;

/** Identifies an item. */
export type ItemId = Branded<"ItemId">;

/** Identifies a photo. */
export type PhotoId = Branded<"PhotoId">;

/** Public, shareable identifier printed on a storage unit QR code. */
export type PublicId = Branded<"PublicId">;

export const unitId = (value: string): UnitId => value as UnitId;

export const itemId = (value: string): ItemId => value as ItemId;

export const photoId = (value: string): PhotoId => value as PhotoId;

export const publicId = (value: string): PublicId => value as PublicId;
