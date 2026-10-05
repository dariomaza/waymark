# HTTP API

Everything but `GET /health`, `POST /auth/login` and the two
`POST /auth/passkey-login` routes needs a session — or a machine token
(ADR 17), which is a credential for a program rather than a person and travels
under its own `Authorization` scheme. The passkey sign-in routes are
unauthenticated for the same reason the login is: they are how a session
begins. They take no username, and they answer the same thing to everybody.

These paths are the API's half of the origin (ADR 16). Anything else that no
route matches is the web client's, and is answered with the app shell — but
only for a `GET` or a `HEAD`, and only when it is a real file or a path with
no file extension. A sub-path of any row below is JSON, a missing `.js` is
JSON, and a write to a path nothing serves is JSON.

| Method   | Route                       | Answers                                      |
| -------- | --------------------------- | -------------------------------------------- |
| `GET`    | `/health`                   | `{ status, commit }` — `commit` is which one is running (ADR 23) |
| `POST`   | `/auth/login`               | `{ token, expiresAt, user }` — `user.mustChangePassword` says a temporary password must be replaced |
| `GET`    | `/auth/me`                  | `{ user }`, or `{ machineToken }` for a machine |
| `POST`   | `/auth/logout`              | `204` — a session only; a machine token gets 403 |
| `POST`   | `/auth/password`            | `{ user }` — body `{ password, currentPassword? }`; your own, ends your other sessions; a machine token gets 403 |
| `POST`   | `/auth/passkey-login/options` | `{ ceremonyId, options }` — no session, no username |
| `POST`   | `/auth/passkey-login`       | `{ token, expiresAt, user }` — the same session a password opens |
| `GET`    | `/auth/passkeys`            | `{ passkeys }` — your own devices, never anybody else's |
| `POST`   | `/auth/passkeys/options`    | `{ ceremonyId, options }` — needs a password-backed session |
| `POST`   | `/auth/passkeys`            | `201 { passkey }` — needs a password-backed session |
| `DELETE` | `/auth/passkeys/:id`        | `204` — one device, any session                |
| `GET`    | `/auth/accounts`            | `{ accounts }` — every account, its role and state; administrator only |
| `POST`   | `/auth/accounts`            | `201 { account, temporaryPassword }` — body `{ username, role }`; administrator only |
| `POST`   | `/auth/accounts/:id/role`   | `{ account }` — body `{ role }`; administrator only |
| `POST`   | `/auth/accounts/:id/password` | `{ account, temporaryPassword }` — no body, signs them out; administrator only |
| `POST`   | `/auth/accounts/:id/disable` | `{ account }` — signs them out, revokes their tokens; administrator only |
| `POST`   | `/auth/accounts/:id/enable` | `{ account }`; administrator only            |
| `GET`    | `/search`                   | `{ query, terms, items, storageUnits }`      |
| `GET`    | `/storage-units`            | `{ tree }` — every tree you can see, nested, each space with your `access` |
| `POST`   | `/storage-units`            | `201 { unit }`                               |
| `GET`    | `/storage-units/:id`        | `{ unit, path, children, items }`            |
| `PATCH`  | `/storage-units/:id`        | `{ unit }` — name, kind, description         |
| `POST`   | `/storage-units/:id/move`   | `{ unit }` — body `{ parentId }`             |
| `POST`   | `/storage-units/:id/empty`  | `{ movedItems, movedChildUnits }`            |
| `DELETE` | `/storage-units/:id`        | `204`                                        |
| `GET`    | `/storage-units/:id/shares` | `{ shares }` — who it is shared with, and how far; administrator only |
| `POST`   | `/storage-units/:id/shares/:accountId` | `{ share }` — body `{ access: "view" \| "edit" }`; administrator only |
| `DELETE` | `/storage-units/:id/shares/:accountId` | `204`, shared or not; administrator only |
| `GET`    | `/items`                    | `{ items }` — every item you can see, each with its path |
| `POST`   | `/items`                    | `201 { item }`                               |
| `GET`    | `/items/:id`                | `{ item, storageUnit, path }`                |
| `PATCH`  | `/items/:id`                | `{ item }` — name, description, quantity, tags |
| `POST`   | `/items/move`               | `{ items }` — body `{ itemIds, targetUnitId }` |
| `DELETE` | `/items/:id`                | `{ releasedPhotoIds }` — and the files go     |
| `GET`    | `/storage-units/:id/qr.png` | A QR encoding `<base>/u/<publicId>`          |
| `GET`    | `/storage-units/:id/qr.svg` | The same symbol, for printing                |
| `POST`   | `/storage-units/:id/photo`  | `201 { photo, unit, releasedPhotoIds }`      |
| `DELETE` | `/storage-units/:id/photo`  | `{ unit, releasedPhotoIds }`                 |
| `POST`   | `/items/:id/photos`         | `201 { photo, item }` — multipart `file`      |
| `POST`   | `/items/:id/photos/order`   | `{ item }` — body `{ photoIds }`, first is cover |
| `DELETE` | `/items/:id/photos/:photoId`| `{ item, releasedPhotoIds }`                 |
| `GET`    | `/photos/:id`               | The image, streamed                          |
| `GET`    | `/photos/:id/thumbnail`     | The small one, for list screens              |
| `GET`    | `/photos/processing`        | `{ processor, counts, abandoned }`           |
| `POST`   | `/photos/:id/reprocess`     | `202 { photo }` — back to `PENDING`          |
| `POST`   | `/photos/processing/retry`  | `202 { requeued }` — every `FAILED` photo    |

`PATCH` changes what a thing SAYS about itself; move and empty stay named
operations because they change what it IS (ADR 14). The line is held by the
schema rather than by discipline: the patch bodies are strict and carry no
`parentId` and no `storageUnitId`, so a request that tries to rename and move
in one call is refused with a 400 naming the key. Ignoring it would be the
worse failure — a client would believe it had moved a box.

`GET /items` answers everything its caller can see in one request,
unpaginated, and every row carries its breadcrumb (ADR 15). A flat list of names answers
nothing in a product about knowing where things are, and the honest answer to
an inventory too large to list is search rather than a page.

## Domain errors are mapped, never left to fall through

| Domain error                    | Status | Reason                                              |
| ------------------------------- | ------ | --------------------------------------------------- |
| `StorageUnitNotFound` (in URL)  | 404    | The addressed resource is not there.                 |
| `StorageUnitNotFound` (in body) | 422    | The route exists; a value in the request names nothing. |
| `ItemNotFound`                  | 404/422| Same rule.                                           |
| `StorageUnitNotEmpty`           | 409    | Refused by the state of the unit (ADR 3).            |
| `CyclicStorageUnitMove`         | 409    | Refused by the shape of the tree (ADR 2).            |
| `MissingEmptyTarget`            | 422    | The request is incomplete.                           |
| `InvalidQuantity`               | 422    | Valid JSON, value the domain refuses.                |
| `TooManyItemPhotos`             | 409    | Refused by the current contents of the item.         |
| `PhotoNotOnItem`                | 422    | The request names a photo the item does not hold.    |
| `SpaceIsViewOnly`               | 403    | `VIEW_ONLY`: seen, shared to view, not to edit (ADR 26). |
| `OwnerOnly`                     | 403    | `OWNER_ONLY`: only the owner makes or moves a root (ADR 26). |
| `OutsideTokenSpaces`            | 403    | `OUTSIDE_TOKEN_SPACES`: beyond a narrowed token's chosen spaces (ADR 26). |
| `InvalidMachineToken`           | 401    | Unknown, revoked, expired, or not shaped like one.   |
| `ReadOnlyMachineToken`          | 403    | Authenticated, and not allowed to change anything.   |

409 means "fix the world, then retry": the same bytes succeed once somebody
empties the box or moves the target out of the subtree. 422 means "fix the
request": nothing anybody else does will make these exact bytes work. A test
walks every `DomainError` the domain exports and fails if one has no entry in
the table, so an unmapped error can never become an accidental 500.

A read-only machine token refused a write is deliberately **neither** of those
two codes. The request bytes are correct and the world is correct — the
identical call succeeds the moment a read-write token makes it — so both "fix
the world" and "fix the request" would be advice the caller cannot act on. What
has to change is the CREDENTIAL, and 403 is what RFC 9110 has for "understood,
authenticated, refused to authorize". 401 would be wrong too: it means
"authenticate", and this caller already did (ADR 17).

The two refusals of ADR 26 are 403 for the same reason. A space a person may
not see answers exactly as a missing id does, 404 in the URL and 422 in the
body; one they may see but only view answers `VIEW_ONLY`, naming the space that
stops the write. Every write checks in one order — can every target be seen,
then may it be changed, then the inventory's own rules — so not even "this box
is not empty" can confirm that somebody else's box exists. A machine token's
scope is checked before all of it, and its issuer's access after.

The account and share routes refuse with codes of their own:

| Code                                   | Status | Why                                                  |
| -------------------------------------- | ------ | ---------------------------------------------------- |
| `ADMINISTRATOR_ONLY`                   | 403    | Only an administrator manages accounts and shares.   |
| `MACHINE_TOKEN_CANNOT_MANAGE_ACCOUNTS` | 403    | A machine never manages a person (ADR 18).           |
| `MACHINE_TOKEN_CANNOT_SHARE`           | 403    | A machine never hands out access (ADR 18).           |
| `ACCOUNT_NOT_FOUND`                    | 404    | The account in the path is not there.                |
| `USERNAME_ALREADY_TAKEN`               | 409    | Somebody already has that name.                      |
| `LAST_ADMINISTRATOR`                   | 409    | The last active administrator can be neither demoted nor disabled. |
| `OWN_ACCOUNT`                          | 409    | Another administrator changes your own role, password or state. |
| `ACCOUNT_DISABLED`                     | 409    | Enable it first; then the same share succeeds.       |
| `ALREADY_HAS_EDIT`                     | 409    | The tree's owner, or an administrator, already may edit it. |
| `PASSWORD_TOO_SHORT`                   | 422    | Under the 12 character minimum.                      |
| `PASSWORD_CHANGE_REQUIRED`             | 403    | The password is a temporary one: only `/auth/me`, `/auth/logout` and `/auth/password` until it is changed. |
| `PASSWORD_UNCHANGED`                   | 422    | The new password is the current one.                 |
| `CURRENT_PASSWORD_REQUIRED`            | 422    | Changing your own password needs the current one, unless it is temporary. |

A password made from the account screen, on create or on reset, is generated
by the server: four groups of four lower-case letters, about 72 bits, answered
once as `temporaryPassword` and never readable again. The person must replace
it with `POST /auth/password` the first time they sign in; until then every
other route answers `PASSWORD_CHANGE_REQUIRED`, whether they signed in with
the password or a passkey. A wrong `currentPassword` is answered as a wrong
sign-in, `401 INVALID_CREDENTIALS`, and counted by the same limiter — it does
not mean the session ended. The first account, made with `create-user`, is
never flagged (ADR 26, amended).
