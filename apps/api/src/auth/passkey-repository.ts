import type { Passkey } from "./passkey.js";

/**
 * Where passkeys are kept.
 *
 * A port beside `SessionRepository`, `UserRepository` and
 * `MachineTokenRepository`, in `@waymark/api` rather than in
 * `@waymark/domain`, for the reason `user.ts` gives. Like the machine token's,
 * and unlike the other two, it comes with a shared contract suite — see
 * `passkey-repository.contract.ts` — so the in-memory fake and the Prisma
 * adapter are provably interchangeable rather than hopefully so.
 *
 * ## Every read but one is scoped by person, and that is not ADR 5's scoping
 *
 * ADR 18 makes every machine token visible to everybody who could have minted
 * one, on purpose: a machine token is a key to the shared house, and a
 * credential nobody can see is a credential nobody revokes.
 *
 * A passkey is the other kind of thing. It is a particular person's particular
 * device, and the list of somebody's authenticators is information about them
 * — which laptop they own, whether they carry a security key, how many devices
 * they have. So `list` and `deleteFor` take a `userId`.
 *
 * That is not the per-user scoping ADR 5 refused. ADR 5 refused an owner
 * column on `StorageUnit`, `Item` and `Photo` and a query scoped by a person;
 * no inventory query changes here, no inventory entity gains a column, and
 * every authenticated human still performs every inventory operation. This is
 * scoped for the reason a session is: `POST /auth/logout` has always ended
 * only your own.
 */
export interface PasskeyRepository {
  /**
   * The read on the sign-in path, and the only one that is not scoped.
   *
   * It cannot be: a discoverable-credential sign-in carries no username, so
   * this lookup is what DECIDES whose session to open. The credential id is
   * unique across everybody, and the index decides equality — so no credential
   * id is ever compared byte by byte in application code, which is the same
   * property `MachineTokenRepository.findByTokenHash` is careful about.
   */
  findByCredentialId(credentialId: string): Promise<Passkey | null>;

  /** Every passkey one person has, for their own list. Newest last. */
  listForUser(userId: string): Promise<readonly Passkey[]>;

  /** Rejects when this credential id is already registered. The index decides. */
  create(passkey: Passkey): Promise<void>;

  /**
   * Stamps `lastUsedAt` and moves the counter, in one write, because they are
   * one fact: this credential was used, and this is what it said when it was.
   *
   * A no-op for an id that is not there, so a passkey removed while one of its
   * sign-ins was in flight is an ordinary race and not a 500 — the same shrug
   * `MachineTokenRepository.recordLastUsed` makes.
   */
  recordUse(id: string, at: Date, signCount: number): Promise<void>;

  /**
   * Removal, scoped to the person doing it.
   *
   * `false` when that id is not one of theirs — whether because it never
   * existed or because it belongs to somebody else, which are deliberately the
   * same answer. A route that could tell them apart would confirm the
   * existence of another person's credential to whoever guessed its id.
   *
   * Not idempotent-and-silent, for the reason `RevokeMachineToken` gives:
   * removing a credential is a person acting on a decision, and "done" in
   * answer to nothing lets them walk away believing a key they no longer trust
   * has gone.
   */
  deleteFor(userId: string, id: string): Promise<boolean>;
}
