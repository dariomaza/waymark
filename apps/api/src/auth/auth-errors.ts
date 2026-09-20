/**
 * Base class for every authentication failure raised on purpose, mirroring
 * `DomainError` in `@ariadna/domain`: one `instanceof` tells a refused request
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
