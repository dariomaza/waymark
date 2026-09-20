import type { ItemId, PhotoId, UnitId } from "@ariadna/domain";

import { ApiError, OFFLINE_STATUS } from "./api-error.js";
import type {
  Credentials,
  CreateItemInput,
  CreateStorageUnitInput,
  DetachedItemPhotoResponse,
  DetachedStorageUnitPhotoResponse,
  EmptyStorageUnitResponse,
  ItemDetailResponse,
  ItemPhotoResponse,
  ItemResponse,
  MovedItemsResponse,
  ReleasedPhotosResponse,
  SearchQuery,
  SearchResponse,
  SessionView,
  StorageUnitDetailResponse,
  StorageUnitPhotoResponse,
  StorageUnitResponse,
  StorageUnitTreeResponse,
  UserView,
} from "./contract.js";

export interface AriadnaClientOptions {
  /** Absolute; this app and the API live on different origins. */
  readonly baseUrl: string;
  /** Read per request, so a refreshed session takes effect immediately. */
  readonly token: () => string | null;
  /**
   * Called when a token this client PRESENTED was refused, which is the only
   * thing that means "the session is over". A rejected password is a 401 too,
   * and it must not throw the user out of a session they never had.
   */
  readonly onUnauthorized?: (() => void) | undefined;
}

/**
 * # The only place in the app that speaks HTTP
 *
 * Every call goes through `send`, so the bearer token, the error envelope and
 * the difference between "the API refused" and "the request never left the
 * phone" are decided once. Nothing above this file has heard of `fetch`,
 * `Authorization` or a status code.
 *
 * It is an interface with a factory rather than a class with methods to stub,
 * because the tests do not stub it: they run this code against MSW. A test
 * that replaced this module would only prove that the replacement was called.
 */
export interface AriadnaClient {
  login(credentials: Credentials): Promise<SessionView>;
  me(): Promise<{ readonly user: UserView }>;
  logout(): Promise<void>;

  tree(): Promise<StorageUnitTreeResponse>;
  unit(id: UnitId): Promise<StorageUnitDetailResponse>;
  createUnit(input: CreateStorageUnitInput): Promise<StorageUnitResponse>;
  moveUnit(id: UnitId, parentId: UnitId | null): Promise<StorageUnitResponse>;
  emptyUnit(id: UnitId, targetUnitId?: UnitId): Promise<EmptyStorageUnitResponse>;
  deleteUnit(id: UnitId): Promise<void>;

  item(id: ItemId): Promise<ItemDetailResponse>;
  createItem(input: CreateItemInput): Promise<ItemResponse>;
  moveItems(itemIds: readonly ItemId[], targetUnitId: UnitId): Promise<MovedItemsResponse>;
  deleteItem(id: ItemId): Promise<ReleasedPhotosResponse>;

  search(query: SearchQuery): Promise<SearchResponse>;

  uploadItemPhoto(id: ItemId, file: File): Promise<ItemPhotoResponse>;
  reorderItemPhotos(id: ItemId, photoIds: readonly PhotoId[]): Promise<ItemResponse>;
  deleteItemPhoto(id: ItemId, photoId: PhotoId): Promise<DetachedItemPhotoResponse>;
  uploadUnitPhoto(id: UnitId, file: File): Promise<StorageUnitPhotoResponse>;
  deleteUnitPhoto(id: UnitId): Promise<DetachedStorageUnitPhotoResponse>;

  /**
   * Photos and QR symbols are behind the session like everything else, so a
   * plain `<img src>` would answer 401. They are fetched with the token and
   * handed to the DOM as object URLs; see `photos/`.
   *
   * The path is whatever the API put in `photo.url`. This client never builds
   * one, which is the point of the API spelling them out.
   */
  fetchImage(path: string): Promise<Blob>;
  qrSvg(id: UnitId): Promise<string>;
  qrPngUrl(id: UnitId): string;
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

export const createAriadnaClient = (options: AriadnaClientOptions): AriadnaClient => {
  const url = (path: string): string => `${options.baseUrl}${path}`;

  const send = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = options.token();
    const headers = new Headers(init.headers);
    if (token !== null) {
      headers.set("authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetch(url(path), { ...init, headers });
    } catch (cause) {
      // `fetch` rejects for exactly one reason a user can act on: the request
      // never got out. Everything else the API says with a status code.
      throw new ApiError(
        OFFLINE_STATUS,
        "OFFLINE",
        "The app could not reach Ariadna",
        { cause: String(cause) },
      );
    }

    if (response.ok) {
      return response;
    }

    if (response.status === 401 && token !== null) {
      options.onUnauthorized?.();
    }

    throw await toApiError(response);
  };

  const readJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await send(path, init);

    return (await response.json()) as T;
  };

  const post = async <T>(path: string, body?: unknown): Promise<T> =>
    readJson<T>(path, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: JSON_HEADERS, body: JSON.stringify(body) }),
    });

  const upload = async <T>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    // `file` is the field name `@fastify/multipart` reads on the API side.
    form.append("file", file, file.name);

    return readJson<T>(path, { method: "POST", body: form });
  };

  return {
    async login(credentials) {
      return readJson<SessionView>("/auth/login", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(credentials),
      });
    },

    async me() {
      return readJson<{ user: UserView }>("/auth/me");
    },

    async logout() {
      await send("/auth/logout", { method: "POST" });
    },

    async tree() {
      return readJson<StorageUnitTreeResponse>("/storage-units");
    },

    async unit(id) {
      return readJson<StorageUnitDetailResponse>(`/storage-units/${encodeURIComponent(id)}`);
    },

    async createUnit(input) {
      return post<StorageUnitResponse>("/storage-units", input);
    },

    async moveUnit(id, parentId) {
      return post<StorageUnitResponse>(
        `/storage-units/${encodeURIComponent(id)}/move`,
        { parentId },
      );
    },

    async emptyUnit(id, targetUnitId) {
      return post<EmptyStorageUnitResponse>(
        `/storage-units/${encodeURIComponent(id)}/empty`,
        targetUnitId === undefined ? {} : { targetUnitId },
      );
    },

    async deleteUnit(id) {
      await send(`/storage-units/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    async item(id) {
      return readJson<ItemDetailResponse>(`/items/${encodeURIComponent(id)}`);
    },

    async createItem(input) {
      return post<ItemResponse>("/items", input);
    },

    async moveItems(itemIds, targetUnitId) {
      return post<MovedItemsResponse>("/items/move", { itemIds, targetUnitId });
    },

    async deleteItem(id) {
      return readJson<ReleasedPhotosResponse>(`/items/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },

    async search(query) {
      const params = new URLSearchParams({ q: query.query });
      if (query.within !== undefined) {
        params.set("within", query.within);
      }
      if (query.limit !== undefined) {
        params.set("limit", String(query.limit));
      }

      return readJson<SearchResponse>(`/search?${params.toString()}`);
    },

    async uploadItemPhoto(id, file) {
      return upload<ItemPhotoResponse>(`/items/${encodeURIComponent(id)}/photos`, file);
    },

    async reorderItemPhotos(id, photoIds) {
      return post<ItemResponse>(`/items/${encodeURIComponent(id)}/photos/order`, {
        photoIds,
      });
    },

    async deleteItemPhoto(id, photoId) {
      return readJson<DetachedItemPhotoResponse>(
        `/items/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      );
    },

    async uploadUnitPhoto(id, file) {
      return upload<StorageUnitPhotoResponse>(
        `/storage-units/${encodeURIComponent(id)}/photo`,
        file,
      );
    },

    async deleteUnitPhoto(id) {
      return readJson<DetachedStorageUnitPhotoResponse>(
        `/storage-units/${encodeURIComponent(id)}/photo`,
        { method: "DELETE" },
      );
    },

    async fetchImage(path) {
      const response = await send(path);

      return await response.blob();
    },

    async qrSvg(id) {
      const response = await send(`/storage-units/${encodeURIComponent(id)}/qr.svg`);

      return await response.text();
    },

    qrPngUrl(id) {
      return url(`/storage-units/${encodeURIComponent(id)}/qr.png`);
    },
  };
};

const toApiError = async (response: Response): Promise<ApiError> => {
  const fallback = new ApiError(
    response.status,
    "UNREADABLE_ERROR",
    `Ariadna answered ${response.status} with something this app cannot read`,
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fallback;
  }

  if (typeof body !== "object" || body === null || !("error" in body)) {
    return fallback;
  }

  const envelope = (body as { error: unknown }).error;
  if (typeof envelope !== "object" || envelope === null) {
    return fallback;
  }

  const { code, message, details } = envelope as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };

  return new ApiError(
    response.status,
    typeof code === "string" ? code : fallback.code,
    typeof message === "string" ? message : fallback.message,
    typeof details === "object" && details !== null
      ? (details as Record<string, unknown>)
      : {},
  );
};
