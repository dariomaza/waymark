import type { ItemId, PhotoId, UnitId } from "@waymark/domain";

import { ApiError, OFFLINE_STATUS } from "./api-error.js";
import type {
  CallerResponse,
  Credentials,
  CreateItemInput,
  CreateMachineTokenInput,
  CreateStorageUnitInput,
  DetachedItemPhotoResponse,
  DetachedStorageUnitPhotoResponse,
  EmptyStorageUnitResponse,
  ItemDetailResponse,
  ItemListResponse,
  ItemPhotoResponse,
  ItemResponse,
  IssuedMachineTokenResponse,
  MachineTokenListResponse,
  MovedItemsResponse,
  PhotoProcessingResponse,
  ReleasedPhotosResponse,
  RequeuedPhotoResponse,
  RequeuedPhotosResponse,
  RotateMachineTokenInput,
  SearchQuery,
  SearchResponse,
  SessionView,
  StorageUnitDetailResponse,
  StorageUnitPhotoResponse,
  StorageUnitResponse,
  StorageUnitTreeResponse,
  UpdateItemInput,
  UpdateStorageUnitInput,
} from "./contract.js";

/**
 * The multipart field name `@fastify/multipart` reads on the API side. It is
 * part of the contract, so it is written down once here rather than in each
 * platform's upload adapter.
 */
export const PHOTO_FIELD_NAME = "file";

/**
 * Puts the bytes of one photo into the multipart body.
 *
 * This is the ONE thing the two clients cannot agree on, so it is a parameter
 * rather than a branch. A browser holds a `File` and appends it with its own
 * name. React Native holds a local `file://` URI and appends
 * `{ uri, name, type }`, because turning that URI into a `File` means reading
 * a whole photo into the JavaScript heap on the device it was taken with.
 *
 * Pretending those are the same call would be an abstraction that is a lie in
 * one of the two apps; asking each to state its own is four lines each and
 * true in both.
 */
export type AppendPhoto<TFile> = (
  form: FormData,
  field: typeof PHOTO_FIELD_NAME,
  file: TFile,
) => void;

/**
 * # Which `Authorization` scheme this client's credential travels under
 *
 * There are two kinds of caller and two schemes, and the scheme is what tells
 * them apart at the transport, before anything is looked up (ADR 17). A
 * session presented as `Machine` never reaches the session table and a machine
 * token presented as `Bearer` never reaches the machine token table — neither
 * is a lookup that missed, neither lookup happens — so a leak of one cannot be
 * replayed as the other.
 *
 * It is a property of the CLIENT rather than of the moment, which is why it is
 * one option read once and not a second thing `token()` has to return. A
 * browser and a phone hold a person's session and will never hold anything
 * else; an MCP server holds a machine token and can never obtain a session,
 * because there is no password for it to log in with. What changes request to
 * request is the token's VALUE — a session is refreshed — and that is exactly
 * what `token()` is read per request for.
 */
export const AuthScheme = {
  /** A person's session token (ADR 6): `apps/web`, `apps/mobile`. */
  Session: "Bearer",
  /** A machine token (ADR 17): `apps/mcp`. */
  Machine: "Machine",
} as const;

export type AuthScheme = (typeof AuthScheme)[keyof typeof AuthScheme];

export interface WaymarkClientOptions<TFile> {
  /** Absolute; a client and the API never live on the same origin. */
  readonly baseUrl: string;
  /** Read per request, so a refreshed session takes effect immediately. */
  readonly token: () => string | null;
  /**
   * Defaults to a session bearer, because two of the three consumers hold one
   * and a default that is wrong for them would be a silent 401 in a browser.
   */
  readonly scheme?: AuthScheme | undefined;
  /**
   * Called when a token this client PRESENTED was refused, which is the only
   * thing that means "the session is over". A rejected password is a 401 too,
   * and it must not throw the user out of a session they never had.
   */
  readonly onUnauthorized?: (() => void) | undefined;
  readonly appendPhoto: AppendPhoto<TFile>;
}

/**
 * # The only place either client speaks HTTP
 *
 * Every call goes through `send`, so the bearer token, the error envelope and
 * the difference between "the API refused" and "the request never left the
 * phone" are decided once — for the PWA and for the Android app at the same
 * time. Nothing above this file has heard of `fetch`, `Authorization` or a
 * status code.
 *
 * It is an interface with a factory rather than a class with methods to stub,
 * because the tests do not stub it: they run this code against MSW. A test
 * that replaced this module would only prove that the replacement was called.
 *
 * `TFile` is what the platform calls a photo on its way up. It is the only
 * thing in this contract that is not the same on both.
 */
export interface WaymarkClient<TFile> {
  login(credentials: Credentials): Promise<SessionView>;
  /**
   * Who is calling, which is two shapes because there are two kinds of caller
   * (ADR 17). A client that holds a session gets `{ user }` and may narrow to
   * it; one that holds a machine token gets `{ machineToken }`, which is how
   * it learns its own scope without attempting a write to find out.
   *
   * Both clients that hold a session use this as a liveness probe and read
   * neither key, which is why widening it cost them nothing.
   */
  me(): Promise<CallerResponse>;
  /** A session only. A machine token is refused 403: it is revoked from a shell. */
  logout(): Promise<void>;

  /**
   * # Credentials for programs, managed by a person (ADR 18)
   *
   * All four need a SESSION. A machine token is refused every one of them: a
   * read-scoped one by the API's scope hook, because three of the four are
   * writes, and a read-write one by the routes themselves, because a
   * credential that can issue its own successor cannot be revoked. Listing is
   * refused too — a `GET` passes the scope hook untouched, and enumerating
   * every credential in the house is reconnaissance rather than a read of the
   * inventory.
   *
   * So these live in this client for `apps/web` and `apps/mobile`. `apps/mcp`
   * holds a machine token and will be refused all four, which is the point.
   */
  machineTokens(): Promise<MachineTokenListResponse>;
  /**
   * The secret comes back HERE and nowhere else, once. The server kept a
   * SHA-256 of it and cannot produce it again, so whatever the caller does
   * with this string is the only copy there will be.
   */
  createMachineToken(input: CreateMachineTokenInput): Promise<IssuedMachineTokenResponse>;
  /**
   * A new secret for a credential that already exists, and the death of the
   * old one in the same step.
   *
   * It is one call because neither order of two would be safe: revoke-then-
   * create leaves a window in which the name holds nothing, and create-then-
   * revoke cannot be written at all, because the name is unique and the name
   * is what revocation is keyed by.
   *
   * The old secret stops working immediately, with no grace period. A request
   * already authenticated finishes; every one after it is a 401 until the new
   * secret is in place. That is a real outage for the machine and the screen
   * that offers this says so before the button is pressed.
   */
  rotateMachineToken(
    name: string,
    input?: RotateMachineTokenInput,
  ): Promise<IssuedMachineTokenResponse>;
  /** One name, one credential. There is no call that revokes everything. */
  revokeMachineToken(name: string): Promise<void>;

  tree(): Promise<StorageUnitTreeResponse>;
  unit(id: UnitId): Promise<StorageUnitDetailResponse>;
  createUnit(input: CreateStorageUnitInput): Promise<StorageUnitResponse>;
  /**
   * What the unit SAYS about itself. It cannot move one: the API refuses a
   * `parentId` on this route, and moving is `moveUnit`, which is guarded.
   */
  updateUnit(id: UnitId, changes: UpdateStorageUnitInput): Promise<StorageUnitResponse>;
  moveUnit(id: UnitId, parentId: UnitId | null): Promise<StorageUnitResponse>;
  emptyUnit(id: UnitId, targetUnitId?: UnitId): Promise<EmptyStorageUnitResponse>;
  deleteUnit(id: UnitId): Promise<void>;

  item(id: ItemId): Promise<ItemDetailResponse>;
  /** Every item in the house, each with where it is. One request. */
  items(): Promise<ItemListResponse>;
  createItem(input: CreateItemInput): Promise<ItemResponse>;
  /** What the item SAYS about itself; moving it is `moveItems`. */
  updateItem(id: ItemId, changes: UpdateItemInput): Promise<ItemResponse>;
  moveItems(itemIds: readonly ItemId[], targetUnitId: UnitId): Promise<MovedItemsResponse>;
  deleteItem(id: ItemId): Promise<ReleasedPhotosResponse>;

  search(query: SearchQuery): Promise<SearchResponse>;

  uploadItemPhoto(id: ItemId, file: TFile): Promise<ItemPhotoResponse>;
  reorderItemPhotos(id: ItemId, photoIds: readonly PhotoId[]): Promise<ItemResponse>;
  deleteItemPhoto(id: ItemId, photoId: PhotoId): Promise<DetachedItemPhotoResponse>;
  uploadUnitPhoto(id: UnitId, file: TFile): Promise<StorageUnitPhotoResponse>;
  deleteUnitPhoto(id: UnitId): Promise<DetachedStorageUnitPhotoResponse>;

  /**
   * # Asking for a background removal again
   *
   * ADR 4 left one consequence open — "`FAILED` photos need a retry path,
   * otherwise they stay unprocessed forever" — and ADR 10 built it. These
   * are that path, shared by both clients because a `FAILED` photo looks the
   * same on a phone as in a browser.
   *
   * Both answer `202`. The photo is back in the queue; whether a sidecar is
   * running, reachable or installed at all is a separate question, and
   * `photoProcessing` is where it is asked. Nothing here waits for `DONE`.
   */
  reprocessPhoto(id: PhotoId): Promise<RequeuedPhotoResponse>;
  /** Every `FAILED` photo at once, up to the bound the API sets. */
  retryFailedPhotos(): Promise<RequeuedPhotosResponse>;
  /** Whether the sidecar is on and answering, and what is stuck. */
  photoProcessing(): Promise<PhotoProcessingResponse>;

  /**
   * Photos and QR symbols are behind the session like everything else, so a
   * plain `<img src>` would answer 401. The browser fetches the bytes with the
   * token and hands them to the DOM as an object URL; see `apps/web/photos/`.
   *
   * The path is whatever the API put in `photo.url`. This client never builds
   * one, which is the point of the API spelling them out.
   */
  fetchImage(path: string): Promise<Blob>;
  /**
   * The same path, as an address something else can fetch.
   *
   * A React Native `<Image>` carries its own `Authorization` header rather
   * than an object URL, which is how a phone streams a photo into the decoder
   * instead of holding all of it. It still needs the absolute URL, and it
   * still must not build one out of an id.
   */
  absoluteUrl(path: string): string;
  qrSvg(id: UnitId): Promise<string>;
  qrPngUrl(id: UnitId): string;
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

export const createWaymarkClient = <TFile>(
  options: WaymarkClientOptions<TFile>,
): WaymarkClient<TFile> => {
  const url = (path: string): string => `${options.baseUrl}${path}`;

  const send = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = options.token();
    const headers = new Headers(init.headers);
    if (token !== null) {
      headers.set("authorization", `${options.scheme ?? AuthScheme.Session} ${token}`);
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
        "The app could not reach Waymark",
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

  const patch = async <T>(path: string, body: unknown): Promise<T> =>
    readJson<T>(path, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });

  const upload = async <T>(path: string, file: TFile): Promise<T> => {
    const form = new FormData();
    options.appendPhoto(form, PHOTO_FIELD_NAME, file);

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
      return readJson<CallerResponse>("/auth/me");
    },

    async logout() {
      await send("/auth/logout", { method: "POST" });
    },

    async machineTokens() {
      return readJson<MachineTokenListResponse>("/auth/machine-tokens");
    },

    async createMachineToken(input) {
      return post<IssuedMachineTokenResponse>("/auth/machine-tokens", {
        name: input.name,
        scope: input.scope,
        // Left off rather than sent as `undefined`: the API refuses a key it
        // does not know, and "no expiry" is an absent field, not a null one.
        ...(input.expiresInDays === undefined
          ? {}
          : { expiresInDays: input.expiresInDays }),
      });
    },

    async rotateMachineToken(name, input) {
      return post<IssuedMachineTokenResponse>(
        `/auth/machine-tokens/${encodeURIComponent(name)}/rotate`,
        input?.expiresInDays === undefined
          ? {}
          : { expiresInDays: input.expiresInDays },
      );
    },

    async revokeMachineToken(name) {
      await send(`/auth/machine-tokens/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
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

    async updateUnit(id, changes) {
      return patch<StorageUnitResponse>(
        `/storage-units/${encodeURIComponent(id)}`,
        changes,
      );
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

    async items() {
      return readJson<ItemListResponse>("/items");
    },

    async createItem(input) {
      return post<ItemResponse>("/items", input);
    },

    async updateItem(id, changes) {
      return patch<ItemResponse>(`/items/${encodeURIComponent(id)}`, changes);
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

    async reprocessPhoto(id) {
      return post<RequeuedPhotoResponse>(
        `/photos/${encodeURIComponent(id)}/reprocess`,
      );
    },

    async retryFailedPhotos() {
      return post<RequeuedPhotosResponse>("/photos/processing/retry");
    },

    async photoProcessing() {
      return readJson<PhotoProcessingResponse>("/photos/processing");
    },

    async fetchImage(path) {
      const response = await send(path);

      return await response.blob();
    },

    absoluteUrl(path) {
      return url(path);
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
    `Waymark answered ${response.status} with something this app cannot read`,
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
