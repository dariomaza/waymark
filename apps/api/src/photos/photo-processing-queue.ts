import {
  photoId as toPhotoId,
  PhotoProcessingStatus,
  type PhotoId,
} from "@ariadna/domain";
import type { PrismaClient } from "@prisma/client";

/**
 * # The queue is the photo table
 *
 * ADR 4 puts the state of a background removal on the photo itself:
 * `PENDING | DONE | FAILED | SKIPPED`. That column is therefore already a
 * durable, crash-proof queue — every photo waiting to be processed is a row
 * with `processingStatus = 'PENDING'`, written in the same transaction as the
 * upload that created it.
 *
 * ## Why no broker
 *
 * The obvious reflex is Redis, BullMQ or a "proper" queue. On one small homelab
 * box that buys nothing and costs a lot:
 *
 * - **It cannot lose work, because it is not a second copy of the truth.** A
 *   broker is a second store that has to be kept in step with the database. The
 *   classic bug is exactly this feature's shape: the row says `PENDING`, the
 *   job was never enqueued (or was enqueued and lost on a restart), and the
 *   photo sits unprocessed for ever with nothing to notice it. Here there is
 *   nothing to keep in step: if the row says `PENDING`, it IS the work.
 * - **A restart is not a special case.** The API comes back up, the worker
 *   sweeps, and every `PENDING` photo — including ones uploaded before the
 *   process died, and ones a dying worker had half-processed — is picked up
 *   again. No durable queue to configure, no dead letter exchange, no `appendfsync`.
 * - **One more container to run, back up and upgrade** on a box whose entire
 *   reason for existing is to stay small. The whole product is one Node process,
 *   one SQLite file and a directory of photos.
 *
 * What a broker would genuinely buy — fan-out across machines — is not a thing
 * this deployment has or wants; the sidecar is a single CPU-bound container on
 * the same box.
 *
 * ## What this table is for, then
 *
 * `PhotoProcessingAttempt` holds the four things the status column cannot say:
 * how many attempts a photo has had, when the next one is due, who is working
 * on it right now, and why it was given up on. A row means "there is history",
 * never "there is work", so losing one can only ever cost a retry counter — it
 * can never lose a photo.
 *
 * ## Claiming, and why it is a lease
 *
 * `claim` takes a photo by writing a LEASE on it, conditionally, in one
 * statement. Two workers — or the same worker woken twice by two uploads
 * arriving together — cannot both take the same photo, because the second
 * conditional write matches nothing. A worker that dies holding a photo does
 * not take it with it: the lease expires and somebody else picks it up.
 *
 * The attempt is counted at CLAIM time, not at failure time. A process that
 * crashes mid-removal has still spent an attempt, which is what makes a crash
 * loop bounded by the same rule as a sidecar answering 500.
 */

export interface ClaimedPhoto {
  readonly photoId: PhotoId;
  /** 1 on the first attempt at this photo. */
  readonly attempt: number;
}

export interface AbandonedPhoto {
  readonly photoId: PhotoId;
  readonly attempts: number;
  readonly lastError: string;
  readonly lastAttemptAt: Date;
}

export type ProcessingCounts = Readonly<Record<PhotoProcessingStatus, number>>;

export interface ClaimRequest {
  readonly now: Date;
  readonly limit: number;
  /** How long the claim holds, if the worker never comes back. */
  readonly leaseMs: number;
}

export interface RetryLaterRequest {
  readonly photoId: PhotoId;
  /** When the photo becomes claimable again. */
  readonly at: Date;
  readonly reason: string;
  readonly now: Date;
}

export interface AbandonRequest {
  readonly photoId: PhotoId;
  readonly reason: string;
  readonly now: Date;
}

export interface PhotoProcessingQueue {
  /** Takes up to `limit` photos nobody else is working on. */
  claim(request: ClaimRequest): Promise<readonly ClaimedPhoto[]>;
  /** Schedules another attempt and releases the lease. */
  retryLater(request: RetryLaterRequest): Promise<void>;
  /** Stops trying, and keeps the reason. */
  abandon(request: AbandonRequest): Promise<void>;
  /** Drops the bookkeeping, so the photo starts again from attempt one. */
  forget(photoId: PhotoId): Promise<void>;
  counts(): Promise<ProcessingCounts>;
  abandoned(limit: number): Promise<readonly AbandonedPhoto[]>;
  failedPhotoIds(limit: number): Promise<readonly PhotoId[]>;
}

/** Prisma's code for "that unique constraint says no". */
const UNIQUE_VIOLATION = "P2002";

interface CandidateRow {
  readonly id: string;
}

interface AbandonedRow {
  readonly photoId: string;
  readonly attempts: number | bigint;
  readonly lastError: string | null;
  readonly updatedAt: Date | number;
}

export class PrismaPhotoProcessingQueue implements PhotoProcessingQueue {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(request: ClaimRequest): Promise<readonly ClaimedPhoto[]> {
    await this.#sweep();

    const claimed: ClaimedPhoto[] = [];
    for (const { id } of await this.#candidates(request)) {
      const attempt = await this.#take(toPhotoId(id), request);
      if (attempt !== null) {
        claimed.push({ photoId: toPhotoId(id), attempt });
      }
    }

    return claimed;
  }

  async retryLater(request: RetryLaterRequest): Promise<void> {
    await this.prisma.photoProcessingAttempt.updateMany({
      where: { photoId: request.photoId },
      data: {
        nextAttemptAt: request.at,
        // The lease goes with it: the photo is nobody's again, it is simply not
        // due yet. Leaving it held would hide the photo for whichever of the
        // two is longer, for no reason anybody could reconstruct later.
        leaseExpiresAt: null,
        lastError: request.reason,
        updatedAt: request.now,
      },
    });
  }

  async abandon(request: AbandonRequest): Promise<void> {
    await this.prisma.photoProcessingAttempt.updateMany({
      where: { photoId: request.photoId },
      data: {
        leaseExpiresAt: null,
        lastError: request.reason,
        updatedAt: request.now,
      },
    });
  }

  async forget(photoId: PhotoId): Promise<void> {
    await this.prisma.photoProcessingAttempt.deleteMany({ where: { photoId } });
  }

  async counts(): Promise<ProcessingCounts> {
    const grouped = await this.prisma.photo.groupBy({
      by: ["processingStatus"],
      _count: { _all: true },
    });

    const counts: Record<string, number> = {
      [PhotoProcessingStatus.PENDING]: 0,
      [PhotoProcessingStatus.DONE]: 0,
      [PhotoProcessingStatus.FAILED]: 0,
      [PhotoProcessingStatus.SKIPPED]: 0,
    };

    for (const row of grouped) {
      // A status the domain does not know about is a broken row, not a counter
      // to invent: `PrismaPhotoRepository` refuses it on read, and this page
      // must not be the one place it looks normal.
      if (row.processingStatus in counts) {
        counts[row.processingStatus] = row._count._all;
      }
    }

    return counts as ProcessingCounts;
  }

  /**
   * The photos that were given up on, newest first, with the reason.
   *
   * `FAILED` is decided by the photo row; the attempt row only explains it. A
   * failed photo with no attempt row would be one abandoned before this table
   * existed, and it is deliberately not invented here.
   */
  async abandoned(limit: number): Promise<readonly AbandonedPhoto[]> {
    const rows = await this.prisma.$queryRaw<AbandonedRow[]>`
      SELECT a."photoId", a."attempts", a."lastError", a."updatedAt"
        FROM "PhotoProcessingAttempt" a
        JOIN "Photo" p ON p."id" = a."photoId"
       WHERE p."processingStatus" = ${PhotoProcessingStatus.FAILED}
       ORDER BY a."updatedAt" DESC
       LIMIT ${limit}
    `;

    return rows.map((row) => ({
      photoId: toPhotoId(row.photoId),
      attempts: Number(row.attempts),
      lastError: row.lastError ?? "",
      lastAttemptAt: new Date(row.updatedAt),
    }));
  }

  async failedPhotoIds(limit: number): Promise<readonly PhotoId[]> {
    const rows = await this.prisma.photo.findMany({
      where: { processingStatus: PhotoProcessingStatus.FAILED },
      select: { id: true },
      take: limit,
    });

    return rows.map((row) => toPhotoId(row.id));
  }

  /**
   * Reconciles the bookkeeping with the photos.
   *
   * The photo row and this table are two writes and a process can die between
   * them, so rows for photos that finished — or that no longer exist — are
   * swept here rather than assumed to be impossible. `FAILED` rows stay: they
   * are the record of why, and `/photos/processing` is built on them.
   */
  async #sweep(): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "PhotoProcessingAttempt"
       WHERE "photoId" NOT IN (
         SELECT "id" FROM "Photo"
          WHERE "processingStatus" IN (${PhotoProcessingStatus.PENDING}, ${PhotoProcessingStatus.FAILED})
       )
    `;
  }

  /**
   * Photos waiting for a first attempt or due another one, oldest first.
   *
   * `rowid` is upload order, and it is the tiebreaker on purpose: a backlog
   * ordered by a random uuid would keep handing out whichever photo happens to
   * sort low and leave the one that has already been waiting longest waiting
   * longer still.
   */
  async #candidates(request: ClaimRequest): Promise<CandidateRow[]> {
    return this.prisma.$queryRaw<CandidateRow[]>`
      SELECT p."id"
        FROM "Photo" p
        LEFT JOIN "PhotoProcessingAttempt" a ON a."photoId" = p."id"
       WHERE p."processingStatus" = ${PhotoProcessingStatus.PENDING}
         AND (
           a."photoId" IS NULL
           OR (
             a."nextAttemptAt" <= ${request.now}
             AND (a."leaseExpiresAt" IS NULL OR a."leaseExpiresAt" <= ${request.now})
           )
         )
       ORDER BY COALESCE(a."nextAttemptAt", 0) ASC, p."rowid" ASC
       LIMIT ${request.limit}
    `;
  }

  /**
   * Takes one photo, or answers `null` because somebody else got there first.
   *
   * Both branches are ONE conditional statement, which is what makes this safe
   * without a transaction: the `UPDATE` only matches a row that is due and
   * unleased, and the `INSERT` only succeeds if no row existed. A loser sees
   * either zero rows updated or a unique violation, and both mean "not mine".
   */
  async #take(photoId: PhotoId, request: ClaimRequest): Promise<number | null> {
    const leaseExpiresAt = new Date(request.now.getTime() + request.leaseMs);

    const updated = await this.prisma.$executeRaw`
      UPDATE "PhotoProcessingAttempt"
         SET "attempts" = "attempts" + 1,
             "leaseExpiresAt" = ${leaseExpiresAt},
             "updatedAt" = ${request.now}
       WHERE "photoId" = ${photoId}
         AND "nextAttemptAt" <= ${request.now}
         AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${request.now})
    `;

    if (updated === 0) {
      try {
        await this.prisma.photoProcessingAttempt.create({
          data: {
            photoId,
            attempts: 1,
            nextAttemptAt: request.now,
            leaseExpiresAt,
            updatedAt: request.now,
          },
        });

        return 1;
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          return null;
        }

        throw error;
      }
    }

    const row = await this.prisma.photoProcessingAttempt.findUnique({
      where: { photoId },
      select: { attempts: true },
    });

    return row?.attempts ?? null;
  }
}
