import { userId, type UserId } from "@waymark/domain";

import { mayWriteWith, type MachineToken } from "./machine-token.js";
import type { Session } from "./session.js";
import type { User } from "./user.js";

/**
 * Who is behind a request, once the transport has decided which credential was
 * presented.
 *
 * A discriminated union rather than a `user` that is sometimes absent. The two
 * arms are genuinely different things — one is a person with a revocable
 * session, the other is a credential with a scope and no person anywhere near
 * it — and a shape with optional halves would let a handler read `user` off a
 * machine caller and get `undefined` at runtime while typechecking cleanly.
 *
 * Both arms act as a person (ADR 26): a session is that person, and a machine
 * token acts as whoever issued it, narrowed by its scope (ADR 17).
 */
export type Caller = UserCaller | MachineCaller;

export interface UserCaller {
  readonly kind: "user";
  readonly user: User;
  readonly session: Session;
}

export interface MachineCaller {
  readonly kind: "machine";
  readonly machineToken: MachineToken;
}

/**
 * Whether this caller may change anything at all.
 *
 * A person may; which spaces they may change is decided against their access
 * (ADR 26), not here. A machine may only if its scope says so, which is the
 * narrower key ADR 17 argues for.
 *
 * Which REQUESTS count as changing something is a transport question and lives
 * in `http/machine-token-header.ts`. This answers the other half, about the
 * credential, and it answers it without a Fastify instance in sight.
 */
export const callerMayWrite = (caller: Caller): boolean =>
  caller.kind === "user" ? true : mayWriteWith(caller.machineToken.scope);

/** For a log line or a refusal: who this is, in as few words as are true. */
export const callerName = (caller: Caller): string =>
  caller.kind === "user" ? caller.user.username : caller.machineToken.name;

/**
 * The account a request acts as (ADR 26): the person signed in, or the person
 * who issued the machine token presented. What a root created by this request
 * belongs to.
 */
export const personBehind = (caller: Caller): UserId =>
  userId(caller.kind === "user" ? caller.user.id : caller.machineToken.userId);
