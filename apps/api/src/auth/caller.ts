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
 * It stays small on purpose. ADR 5 says every authenticated caller may perform
 * every inventory operation, and that is still true of every PERSON; the only
 * thing this union is allowed to decide is the one question ADR 17 added, which
 * is whether a machine may write.
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
 * Whether this caller may change anything.
 *
 * A person always may — that is ADR 5, unchanged: users are credentials, there
 * are no roles, and everybody who can log in edits the same house. A machine
 * may only if its scope says so, which is the narrower key ADR 17 argues for.
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
