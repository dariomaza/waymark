import { userId, type UserId } from "../shared/identity.js";
import type { Access } from "./access.js";

/**
 * An administrator's access, for tests about something other than who may
 * see or change what. Kept out of `index.ts` so production code cannot reach
 * for it instead of the caller's own access.
 */
export const SEES_EVERYTHING: Access = { kind: "everything" };

/** Whoever acts with `SEES_EVERYTHING`, where a write asks who is acting. */
export const THE_ADMINISTRATOR: UserId = userId("the-administrator");
