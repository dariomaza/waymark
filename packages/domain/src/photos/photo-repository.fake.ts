import type { PhotoId } from "../shared/identity.js";
import type { Photo } from "./photo.js";
import type { PhotoRepository } from "./photo-repository.js";

/** A real, working repository backed by a Map, for use in tests. */
export class InMemoryPhotoRepository implements PhotoRepository {
  readonly #photos = new Map<string, Photo>();

  constructor(photos: readonly Photo[] = []) {
    for (const photo of photos) {
      this.#photos.set(photo.id, photo);
    }
  }

  get size(): number {
    return this.#photos.size;
  }

  async findById(id: PhotoId): Promise<Photo | null> {
    return this.#photos.get(id) ?? null;
  }

  async findManyByIds(ids: readonly PhotoId[]): Promise<Photo[]> {
    return ids
      .map((id) => this.#photos.get(id))
      .filter((photo): photo is Photo => photo !== undefined);
  }

  async save(photo: Photo): Promise<void> {
    this.#photos.set(photo.id, photo);
  }

  async deleteMany(ids: readonly PhotoId[]): Promise<void> {
    for (const id of ids) {
      this.#photos.delete(id);
    }
  }
}
