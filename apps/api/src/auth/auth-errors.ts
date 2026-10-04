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

/**
 * Raised by the admin CLI and by an administrator creating an account from
 * the account screen (ADR 26). There is still no sign-up.
 */
export class UsernameAlreadyTaken extends AuthError {
  constructor(readonly username: string) {
    super(`The username "${username}" is already taken`);
  }
}

/**
 * A password shorter than the minimum, refused before anything is hashed.
 *
 * Raised for an account made from the shell and from the account screen, and
 * for a reset: every account here can be signed in to from the internet.
 */
export class PasswordTooShort extends AuthError {
  constructor(readonly minimumLength: number) {
    super(`The password must be at least ${minimumLength} characters`);
  }
}

/**
 * A new password equal to the current one (ADR 26, amended). With a temporary
 * password it would keep the very one the administrator saw, so it is
 * refused rather than accepted as a change that changed nothing.
 */
export class PasswordUnchanged extends AuthError {
  constructor() {
    super("The new password must be different from the current one");
  }
}

/**
 * Changing your own password without saying what it is now. Asked of every
 * account except one whose password is temporary (ADR 26, amended).
 */
export class CurrentPasswordRequired extends AuthError {
  constructor() {
    super("Changing your password needs your current one");
  }
}

/** A username that is nothing once trimmed. */
export class InvalidUsername extends AuthError {
  constructor() {
    super("A username is required");
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
    /**
     * `tokenName`, never `name`: `AuthError` sets `Error.name` to the class
     * name so one `instanceof` and one field tell a refusal apart in a log, and
     * a parameter property called `name` would quietly overwrite it with
     * "mcp-server".
     */
    readonly tokenName: string,
    readonly method: string,
  ) {
    super(
      `The machine token "${tokenName}" is read-only and may not ${method} anything`,
    );
  }
}

/** Raised by the admin CLI, never by an HTTP route: there is no self-service. */
export class MachineTokenNameAlreadyTaken extends AuthError {
  constructor(readonly tokenName: string) {
    super(`A machine token named "${tokenName}" already exists`);
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
  constructor(readonly tokenName: string) {
    super(
      `"${tokenName}" is not a usable machine token name: use lower case letters, ` +
        "digits, and any of . _ -",
    );
  }
}

/**
 * # One error for every way a passkey ceremony can fail to prove anything
 *
 * An unknown credential, a signature that does not check out, an assertion for
 * a challenge that was never issued, an authenticator claiming an RP ID that
 * is not ours, a registration finished by somebody other than the person it
 * was started for. All of them, one error, one message — for the reason
 * `InvalidSession` and `InvalidMachineToken` both fold theirs: telling a
 * caller WHICH part of a proof failed is free help for whoever is constructing
 * the next attempt.
 *
 * It is separate from `PasskeyCeremonyExpired` on purpose, and that one really
 * is different: it is about a clock rather than about a proof, it happens to
 * people who read the prompt slowly, and the answer to it is "press the button
 * again" rather than "something is wrong with this device".
 */
export class InvalidPasskey extends AuthError {
  constructor() {
    super("That passkey could not be used to sign in");
  }
}

/**
 * The ceremony is over: unknown, already finished, or older than two minutes.
 *
 * Not folded into `InvalidPasskey`, because it says nothing about a
 * credential. A person whose phone went to sleep mid-prompt has a perfectly
 * good passkey and needs to be told to start again, and "that passkey could
 * not be used to sign in" would send them looking for a fault in their thumb.
 */
export class PasskeyCeremonyExpired extends AuthError {
  constructor() {
    super("That passkey prompt has expired or was already used; start again");
  }
}

/**
 * The authenticator proved somebody was present and did not prove WHO.
 *
 * ADR 19 requires user verification, and this is what that costs: a security
 * key with no PIN, no sensor and no screen cannot register one here. The
 * message says what the device would have to be able to do, because the person
 * reading it can act on that — and the password form they came in with is
 * still on the screen either way.
 */
export class PasskeyDidNotVerifyTheUser extends AuthError {
  constructor() {
    super(
      "That device did not check that it is you. A passkey has to ask for your " +
        "fingerprint, your face or a PIN",
    );
  }
}

/**
 * The signature counter went backwards, which is what a cloned authenticator
 * looks like.
 *
 * The sign-in is refused and the passkey is deliberately NOT deleted: many
 * authenticators keep no counter at all, this signal can be produced by a
 * buggy one, and destroying somebody's credential on a heuristic while they
 * are standing in a garage is worse than refusing once. The name travels so
 * the person can be told which device to remove.
 */
export class ClonedPasskey extends AuthError {
  constructor(readonly label: string) {
    super(
      `The passkey "${label}" reported a signature counter that went backwards, ` +
        "which means it may have been copied. Remove it and register the device again",
    );
  }
}

/**
 * This credential is already registered — to this person or to another.
 *
 * The browser's `excludeCredentials` normally prevents it, and that list lives
 * in the request, which is the one place an attacker is. The unique index is
 * what actually decides.
 */
export class PasskeyAlreadyRegistered extends AuthError {
  constructor() {
    super("That device already has a passkey for Waymark");
  }
}

/** Empty, whitespace, or longer than a row can show. */
export class InvalidPasskeyLabel extends AuthError {
  constructor(readonly label: string) {
    super(
      `"${label}" is not a usable name for a device: give it something short, ` +
        "like Pixel 8 or Work laptop",
    );
  }
}

/** Removing one by an id that is not one of yours. */
export class PasskeyNotFound extends AuthError {
  constructor(readonly passkeyId: string) {
    super("There is no such passkey on this account");
  }
}

/**
 * A passkey may be added only from a session that was opened with a password
 * (ADR 19).
 *
 * The same shape of rule ADR 18 makes about a machine token that could mint a
 * machine token, and for the same reason: a credential able to issue its own
 * successor outlives every password change made to stop it. Somebody who
 * signed in with their phone and now wants to add their laptop types their
 * password once, which is the entire cost.
 */
export class PasskeyNeedsAPassword extends AuthError {
  constructor() {
    super(
      "Adding a passkey needs your password. Sign out and sign in with it, then " +
        "add this device",
    );
  }
}

/**
 * Too many passkey ceremonies from one caller.
 *
 * A separate counter from the login limiter's, deliberately: see
 * `begin-passkey-authentication.ts`. Neither door may close the other.
 */
export class TooManyPasskeyAttempts extends AuthError {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `Too many passkey attempts. Try again in ${retryAfterSeconds} second(s), or use your password.`,
    );
  }
}

/**
 * # The refusals of managing other people's accounts (ADR 26)
 */

/**
 * The person is signed in and is not an administrator. 403 rather than 404:
 * the route exists, and pretending it did not would be a lie a client could
 * act on.
 */
export class AdministratorOnly extends AuthError {
  constructor(
    readonly username: string,
    /** What was refused, for the message: managing accounts, or sharing a space. */
    act = "manages accounts",
  ) {
    super(`Only an administrator ${act}`);
  }
}

/**
 * A session of an account whose password is a temporary one asked for
 * anything but who it is, signing out, or changing the password (ADR 26,
 * amended). 403: the person is known, and is being refused until they have
 * chosen a password of their own.
 */
export class PasswordChangeRequired extends AuthError {
  constructor(readonly username: string) {
    super("Choose a password of your own before anything else");
  }
}

/** The account the path names is not there. Accounts are never deleted. */
export class AccountNotFound extends AuthError {
  constructor(readonly accountId: string) {
    super("There is no such account");
  }
}

/**
 * Demoting or disabling this account would leave no active administrator, so
 * nothing was changed. 409: the world must change first — make somebody else
 * an administrator — and then the same request succeeds (ADR 8).
 */
export class LastAdministrator extends AuthError {
  constructor(readonly accountId: string) {
    super("This is the last active administrator, so it cannot be demoted or disabled");
  }
}

/**
 * An administrator acting on their own account: their role, their state or
 * their password. Another administrator has to do it; see `ManageAccounts`.
 */
export class OwnAccount extends AuthError {
  constructor(readonly accountId: string) {
    super("Another administrator has to change your own role, password or state");
  }
}

/**
 * # The refusals of sharing a space (ADR 26)
 */

/**
 * The account is disabled, so sharing anything with it would give a key to a
 * door that opens nothing. 409: enable it first, and the same request
 * succeeds (ADR 8). Stopping a share with it is never refused.
 */
export class AccountDisabled extends AuthError {
  constructor(readonly accountId: string) {
    super("This account is disabled; enable it before sharing anything with it");
  }
}

/**
 * The person already has edit on the space: they own the tree it is in, or
 * they are an administrator, who reaches everything (ADR 26). A share could
 * only lower that in appearance, never in fact, so it is refused rather than
 * stored. 409, because what would make it succeed is the world changing — the
 * space moving into somebody else's tree, or the person losing the role.
 */
export class AlreadyHasEdit extends AuthError {
  constructor(
    readonly accountId: string,
    readonly because: "owner" | "administrator",
  ) {
    super(
      because === "owner"
        ? "This person owns the tree this space is in, so they already have edit"
        : "This person is an administrator, so they already have edit",
    );
  }
}
