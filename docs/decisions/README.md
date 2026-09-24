# Decisions

Each file records one decision: the context it was made in, what was decided,
and — always — what it costs. Read the one that governs what you are about to
change before changing it; several of these exist because the obvious approach
was tried first and failed.

## The inventory

| # | Decision |
|---|---|
| [1](0001-storage-units-form-a-recursive-tree.md) | Everything that holds things is one kind of node in one tree. A unit's *kind* is a label, never a rule about what may go inside it. |
| [2](0002-move-validation-rejects-the-whole-subtree.md) | A unit cannot move into itself or anything below it. The check walks the subtree, not just the parent. |
| [3](0003-deleting-a-storage-unit-requires-it-to-be-empty.md) | Nothing is deleted with things still in it; emptying is its own step. |
| [9](0009-photo-order-belongs-to-the-item-not-the-photo.md) | The first photo is the cover, and the order is the item's, not a field on each photo. |
| [14](0014-editing-is-a-patch-that-cannot-move-anything.md) | Editing changes words; moving is a separate operation that edit cannot perform. |
| [15](0015-every-item-in-one-unpaginated-request.md) | A household is small enough to load whole, and every row carries its location. |

## Finding things

| # | Decision |
|---|---|
| [11](0011-search-is-an-fts5-index-kept-by-triggers.md) | Search is SQLite FTS5, kept current by triggers rather than by application code, and ranked in the domain. |
| [12](0012-a-scanned-label-is-resolved-by-the-client.md) | A QR label encodes a URL; the client resolves it against the tree it already holds. |

## Photos

| # | Decision |
|---|---|
| [4](0004-image-background-removal-is-an-optional-adapter.md) | Background removal is an optional sidecar. Without it, photos simply stay as taken. |
| [10](0010-background-removal-is-driven-by-a-polling-worker.md) | A worker polls the photo table rather than a queue being introduced. |

## Who can get in

| # | Decision |
|---|---|
| [5](0005-one-shared-inventory-users-are-credentials.md) | One inventory per household. A user is a way in, not an owner of data. |
| [6](0006-opaque-server-side-session-tokens.md) | Sessions are opaque tokens stored server side, and accounts are created by an admin — there is no sign-up. |
| [7](0007-client-address-comes-from-a-trusted-proxy-header.md) | Rate limiting trusts `CF-Connecting-IP` only from a configured proxy. |
| [17](0017-machine-tokens-are-a-smaller-key-not-a-role.md) | A machine token is a narrower credential for a program, not a separate kind of user. |
| [18](0018-a-person-issues-machine-tokens-a-machine-never-does.md) | Only a person's session can mint a machine token; a credential that could issue its successor could never be revoked. |
| [19](0019-a-passkey-is-an-additional-door-never-a-replacement.md) | Passkeys and the phone's fingerprint are extra doors. The password form never goes away. *Amended: on the phone it is a switch, and the sealed state is a report of what the keystore did.* |

## The two clients

| # | Decision |
|---|---|
| [13](0013-the-pwa-caches-a-shell-and-never-queues-a-write.md) | Offline, the PWA shows what it has and never pretends a change was saved. |
| [16](0016-the-api-serves-the-web-client-from-one-origin.md) | One container serves the API and the web client from one origin, behind one tunnel hostname. |
| [20](0020-the-icons-come-from-one-family-the-mark-does-not.md) | Icons come from lucide behind one atom; the product's mark is drawn by hand. |
| [21](0021-a-screen-has-one-primary-action-and-a-menu-for-the-rest.md) | One primary action per screen, at most one secondary, the rest behind a menu beside the subject's name. *Amended: phones print; the home screen is a row of two.* |
| [22](0022-one-vocabulary-written-once-and-the-phones-shape-wins.md) | Design tokens are written once in `packages/tokens`, and where the clients differ in shape, the phone wins. *Amended: one tab bar for both.* |

## Shipping

| # | Decision |
|---|---|
| [8](0008-http-status-codes-separate-fix-the-world-from-fix-the-request.md) | 409 means the world must change first; 422 means the request was wrong. |
| [23](0023-a-deploy-proves-which-commit-is-serving.md) | A deploy refuses unless CI is green for that commit, and succeeds only when `/health` names it. |

## Writing a new one

- Number it next, name it with the decision as a sentence (`0024-…`), and keep
  the voice of the others: the reasoning, not just the conclusion.
- **Name the cost.** A decision that lists no cost has not been made.
- **Amend, do not contradict.** When a later change reverses part of an ADR,
  add a dated *Amended* section saying what was claimed, what turned out to be
  true, and who decided — and leave the original text, struck through if it is
  now false. Code that silently disagrees with its ADR is worse than no ADR.
- Add a line to this index.
