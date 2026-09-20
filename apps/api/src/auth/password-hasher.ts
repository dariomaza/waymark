import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Turns a password into something a stolen database cannot be turned back into.
 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** `true` when the password matches, `false` when it does not. */
  verify(password: string, encoded: string): Promise<boolean>;
}

export interface ScryptParameters {
  /** `N`: the CPU/memory cost. Memory used is `128 * N * r` bytes. */
  readonly cost: number;
  /** `r`: block size. */
  readonly blockSize: number;
  /** `p`: parallelism. Multiplies work, not memory. */
  readonly parallelism: number;
  /** Length of the derived key, in bytes. */
  readonly keyLength: number;
  /** Length of the per-password salt, in bytes. */
  readonly saltLength: number;
}

/**
 * scrypt, N=2^16, r=8, p=2 — 64 MiB of memory per hash.
 *
 * ## Why scrypt and not Argon2id
 *
 * Argon2id is the better algorithm on paper and the usual first choice. Both
 * Node bindings for it (`argon2`, `@node-rs/argon2`) are native modules: the
 * first compiles C++ at install time, the second ships per-platform prebuilt
 * binaries. Ariadna deploys to a zimaos homelab box and later to multi-arch
 * Docker images, so a native dependency means either a compiler in the runtime
 * image or one optional package per `os`/`cpu`/`libc` triple, both of which are
 * a build problem for a feature that must simply never break.
 *
 * scrypt is memory-hard, is thirteen years old, is what OWASP recommends when
 * Argon2id is unavailable, and lives in `node:crypto`. Zero dependencies, zero
 * compilation, identical behaviour on arm64 and amd64, on glibc and on musl.
 * PBKDF2 was the other dependency-free option and was rejected: it is only
 * CPU-hard, so a GPU or an ASIC attacks it orders of magnitude more cheaply.
 *
 * ## Why these parameters
 *
 * The OWASP Password Storage Cheat Sheet gives two acceptable scrypt settings:
 * `N=2^17, r=8, p=1` (128 MiB) and `N=2^16, r=8, p=2` (64 MiB). The second is
 * used here: it is the same work factor with half the peak memory, which
 * matters because a homelab server also runs everything else the house needs,
 * and because several concurrent logins each allocate their own arena. `p=2`
 * buys the CPU cost back.
 *
 * Cost on a modern machine is roughly 100 ms per hash, which is invisible to a
 * human logging in once a month and ruinous to anyone grinding a stolen table.
 *
 * The parameters are stored INSIDE each hash, so raising them later re-hashes
 * new passwords without invalidating the old ones.
 */
export const DEFAULT_SCRYPT_PARAMETERS: ScryptParameters = {
  cost: 65_536,
  blockSize: 8,
  parallelism: 2,
  keyLength: 32,
  saltLength: 16,
};

/**
 * Raised when a stored password hash cannot be parsed.
 *
 * It throws instead of returning `false` on purpose. `false` means "wrong
 * password", which is a statement about the user; an unparseable record is a
 * statement about the database, and quietly reporting it as a failed login
 * would hide a corrupt table behind a support ticket about a forgotten
 * password.
 */
export class MalformedPasswordHash extends Error {
  constructor(reason: string) {
    super(`Stored password hash is malformed: ${reason}`);
    this.name = "MalformedPasswordHash";
  }
}

const ALGORITHM = "scrypt";

/**
 * scrypt refuses to allocate past `maxmem`, whose default (32 MiB) is below
 * what the parameters above need. Twice the arena leaves room for the internal
 * bookkeeping without lifting the ceiling far enough to matter.
 */
const maxmemFor = (parameters: ScryptParameters): number =>
  128 * parameters.cost * parameters.blockSize * 2;

const encodeBase64Url = (value: Buffer): string => value.toString("base64url");

export class ScryptPasswordHasher implements PasswordHasher {
  constructor(
    private readonly parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS,
  ) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(this.parameters.saltLength);
    const derived = await deriveKey(
      password.normalize("NFKC"),
      salt,
      this.parameters.keyLength,
      {
        N: this.parameters.cost,
        r: this.parameters.blockSize,
        p: this.parameters.parallelism,
        maxmem: maxmemFor(this.parameters),
      },
    );

    return [
      ALGORITHM,
      `N=${this.parameters.cost},r=${this.parameters.blockSize},p=${this.parameters.parallelism}`,
      encodeBase64Url(salt),
      encodeBase64Url(derived),
    ].join("$");
  }

  /**
   * The parameters come from the STORED hash, never from this instance, so a
   * password hashed under yesterday's settings still verifies today.
   */
  async verify(password: string, encoded: string): Promise<boolean> {
    const record = parseEncodedHash(encoded);

    const derived = await deriveKey(
      password.normalize("NFKC"),
      record.salt,
      record.digest.length,
      {
        N: record.cost,
        r: record.blockSize,
        p: record.parallelism,
        maxmem: maxmemFor({
          ...this.parameters,
          cost: record.cost,
          blockSize: record.blockSize,
        }),
      },
    );

    // Constant time: a byte-by-byte `===` leaks how much of the digest matched,
    // which is enough to reconstruct it one byte at a time.
    return timingSafeEqual(derived, record.digest);
  }
}

interface EncodedHash {
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelism: number;
  readonly salt: Buffer;
  readonly digest: Buffer;
}

const PARAMETERS_PATTERN = /^N=(\d+),r=(\d+),p=(\d+)$/u;

const parseEncodedHash = (encoded: string): EncodedHash => {
  const parts = encoded.split("$");
  if (parts.length !== 4) {
    throw new MalformedPasswordHash(
      `expected 4 "$" separated fields, found ${parts.length}`,
    );
  }

  const [algorithm, parameters, salt, digest] = parts as [
    string,
    string,
    string,
    string,
  ];

  if (algorithm !== ALGORITHM) {
    throw new MalformedPasswordHash(`unknown algorithm "${algorithm}"`);
  }

  const matched = PARAMETERS_PATTERN.exec(parameters);
  if (matched === null) {
    throw new MalformedPasswordHash(
      `parameters "${parameters}" are not of the form N=<n>,r=<n>,p=<n>`,
    );
  }

  const [, cost, blockSize, parallelism] = matched as unknown as [
    string,
    string,
    string,
    string,
  ];

  const saltBytes = Buffer.from(salt, "base64url");
  const digestBytes = Buffer.from(digest, "base64url");
  if (saltBytes.length === 0 || digestBytes.length === 0) {
    throw new MalformedPasswordHash("the salt or the digest is empty");
  }

  return {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelism: Number(parallelism),
    salt: saltBytes,
    digest: digestBytes,
  };
};
