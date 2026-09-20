# 7. The client address comes from CF-Connecting-IP, behind a trusted peer

- Status: accepted
- Date: 2026-09-20

## Context

The service is published through `cloudflared`, which holds an outbound tunnel
to Cloudflare and forwards requests over loopback. The socket address of every
single request is therefore the tunnel daemon.

Rate limiting the login endpoint on that address would put every caller on
earth into one bucket: it would throttle Cloudflare, not an attacker, and it
would fail silently while looking like it works.

## Decision

The caller's address is read from `CF-Connecting-IP`, but **only when the peer
is a configured trusted proxy** (loopback by default, overridable when the
daemon runs in its own container). Anyone able to reach the process directly
can forge that header, so an untrusted peer is always identified by its socket
address, which cannot be lied about.

The header is believed only when it holds exactly one syntactically valid IP.
A repeated header means something upstream added a second one, and the
ambiguous case is never the honest one.

`X-Forwarded-For` is ignored entirely. Cloudflare sets both, and anyone may
append to XFF. Two answers to the same question is one too many.

When no address can be determined, all such requests share **one** bucket.
Minting a fresh identifier per request would hand an unidentifiable attacker a
clean rate limit on every attempt.

## Consequences

- Rate limiting counts real callers.
- Deploying the daemon somewhere other than loopback requires configuring its
  address; forgetting to falls back to throttling the daemon, which is loud.
- The trusted-peer boundary is load bearing and is covered by tests that fail
  if it is removed.
