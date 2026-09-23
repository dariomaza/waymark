import { credentialOf, schemeOf } from "./authorization-header.js";

/**
 * # Why a machine token gets a scheme of its own
 *
 * A machine token has to be distinguishable from a session token AT THE
 * TRANSPORT, before anything is looked up. Three ways were available.
 *
 * ## A separate header — rejected
 *
 * `X-Waymark-Machine-Token: wmk_...` works, and it is what several APIs do. It
 * was rejected because it makes a second header secret. Everything in this
 * stack that already knows to be careful with credentials knows about
 * `Authorization` and only about it: the CORS allowlist in `build-app.ts`,
 * whatever redacts logs, the tunnel in front, and every reviewer's instinct. A
 * second one is a second thing to remember in every one of those places, and
 * the day somebody forgets, a credential is in a log.
 *
 * ## A prefix on the token alone — rejected as the mechanism
 *
 * `Authorization: Bearer wmk_...`, with the server branching on the prefix. It
 * needs no new grammar, which is its appeal, and it fails the requirement: the
 * server would have to look INSIDE a credential to decide which table to check,
 * so the two credentials would still be travelling as the same kind of thing.
 * A prefix is also not a promise — nothing stops a session token from beginning
 * with those four characters, and "probably a machine token" is not the sort of
 * answer an authentication path should be built on. The prefix is kept, for the
 * human reasons `machine-token-secret.ts` gives, but it is not what decides.
 *
 * ## A separate scheme — chosen
 *
 * `Authorization: Machine wmk_...`. The scheme is part of RFC 7235's grammar,
 * so this is the header's own way of saying "a different kind of credential",
 * not a convention layered on top. `bearer-token.ts` already refuses every
 * scheme but `Bearer`, so the codebase was already treating the scheme as
 * meaningful; this makes the second scheme explicit rather than smuggling a
 * second credential through the first.
 *
 * What it buys, concretely:
 *
 * - **A leak of one cannot be replayed as the other.** The scope hook reads the
 *   scheme once and hands the request to exactly ONE authenticator. A session
 *   token presented as `Machine` is refused without the session table being
 *   read; a machine token presented as `Bearer` is refused without the machine
 *   token table being read. Neither is a lookup that happened to miss — neither
 *   lookup happens.
 * - **A read-only token is refused a write before any use case runs.** The
 *   scheme tells the hook this is a machine caller, so the scope check happens
 *   in the same hook that authenticated it, on the way in, with no route
 *   handler and no repository involved.
 *
 * The cost is that `WWW-Authenticate` on an unauthenticated request still says
 * `Bearer` and nothing else. That is deliberate: the header exists to tell a
 * BROWSER or a phone how to authenticate, and both of those have exactly one
 * answer. A machine token is configured out of band by an admin with a shell —
 * nothing discovers it from a challenge, so advertising it there would add a
 * scheme to every 401 in the product to help a caller that never reads it.
 */
export const MACHINE_TOKEN_SCHEME = "Machine";

/** The token out of an `Authorization: Machine ...` header, or `null`. */
export const machineTokenOf = (
  header: string | string[] | undefined,
): string | null => credentialOf(header, MACHINE_TOKEN_SCHEME);

/** Whether the caller claimed the machine scheme, whatever it presented. */
export const claimsMachineScheme = (
  header: string | string[] | undefined,
): boolean => schemeOf(header) === MACHINE_TOKEN_SCHEME.toLowerCase();

/**
 * Whether this request would CHANGE anything.
 *
 * Method-based, and deliberately a denylist of "everything that is not a read"
 * rather than an allowlist of known-writing routes. A list of routes is a
 * second copy of the route table that goes stale the day somebody adds one, and
 * the failure is silent and in the dangerous direction: a new write route that
 * nobody added to the list is a write a read-only token is allowed to make.
 *
 * `GET` and `HEAD` are reads by RFC 9110, and `OPTIONS` is a CORS preflight
 * that carries no credential and changes nothing. Everything else — `POST`,
 * `PATCH`, `DELETE`, and anything a future route invents — is a write until
 * somebody deliberately says otherwise here.
 */
export const isWriteRequest = (method: string): boolean =>
  !READ_METHODS.has(method.toUpperCase());

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
