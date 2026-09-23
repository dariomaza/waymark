/**
 * Base class for every authentication failure raised on purpose, mirroring
 * `DomainError` in `@waymark/domain`: one `instanceof` tells a refused request
 * from a crash.
 */
export abstract class AuthError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * ONE error for "no such user" and for "wrong password", with ONE message.
 *
 * Two distinguishable failures would turn the login endpoint into a directory
 * of valid usernames, which is the first half of a credential stuffing run.
 */
export class InvalidCredentials extends AuthError {
  constructor() {
    super("Invalid username or password");
  }
}

/** Raised before any password work is done, so the limiter is not a CPU sink. */
export class TooManyLoginAttempts extends AuthError {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Too many failed login attempts. Try again in ${retryAfterSeconds} second(s).`,
    );
  }
}

/** The token is unknown, expired, or was revoked. Callers cannot tell which. */
export class InvalidSession extends AuthError {
  constructor() {
    super("The session token is missing, invalid or expired");
  }
}

/** Raised by the admin CLI, never by an HTTP route: there is no sign-up. */
export class UsernameAlreadyTaken extends AuthError {
  constructor(readonly username: string) {
    super(`The username "${username}" is already taken`);
  }
}

/**
 * The machine token is unknown, revoked, expired, or was never shaped like one.
 *
 * All four are one error with one message, for the same reason `InvalidSession`
 * folds its three: telling a caller that a token USED to be valid is free
 * information for whoever stole it, and "this one expired" tells an attacker
 * which of a stolen batch are worth trying elsewhere.
 */
export class InvalidMachineToken extends AuthError {
  constructor() {
    super("The machine token is missing, invalid, revoked or expired");
  }
}

/**
 * A read-only machine token was asked to change something.
 *
 * This is an AUTHORIZATION failure and it is deliberately neither of ADR 8's
 * two codes. 409 means "fix the world, then retry" and 422 means "fix the
 * request, then retry"; this is "fix the CREDENTIAL", and the request bytes and
 * the world are both already fine — the identical call succeeds the moment a
 * read-write token presents it. Telling a machine to edit its request would be
 * a lie it cannot act on. See `build-app.ts` for the 403.
 */
export class ReadOnlyMachineToken extends AuthError {
  constructor(
    readonly name: string,
    readonly method: string,
  ) {
    super(
      `The machine token "${name}" is read-only and may not ${method} anything`,
    );
  }
}

/** Raised by the admin CLI, never by an HTTP route: there is no self-service. */
export class MachineTokenNameAlreadyTaken extends AuthError {
  constructor(readonly name: string) {
    super(`A machine token named "${name}" already exists`);
  }
}

/**
 * The name is empty or holds something a person would have to quote to type.
 *
 * The name is not decoration: it is what `machine-token revoke --name`
 * addresses, and the moment revoking a credential needs shell quoting right,
 * revoking it in a hurry is a thing that can go wrong.
 */
export class InvalidMachineTokenName extends AuthError {
  constructor(readonly name: string) {
    super(
      `"${name}" is not a usable machine token name: use lower case letters, ` +
        "digits, and any of . _ -",
    );
  }
}
