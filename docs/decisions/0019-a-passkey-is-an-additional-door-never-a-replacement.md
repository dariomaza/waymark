# 19. A passkey is an additional door, never a replacement

- Status: accepted
- Date: 2026-09-23

## Context

The person who owns this inventory signs in on a phone, in a garage, often
one-handed, and types a password to do it. His phone has a fingerprint reader
and Chrome on Android exposes it to a web page through WebAuthn. The PWA is
served over HTTPS from one origin (ADR 16), which is exactly the condition
WebAuthn needs, so the hardware that unlocks his phone can unlock his
inventory.

An earlier claim in this project — that a browser has no access to a
fingerprint reader — was wrong. It is true of a `<input type="password">` and
false of `navigator.credentials`, and the difference is the whole of this ADR.

The same correction was already made once, for the Expo client: biometrics
there unlock a session that is already there, and the password screen is never
taken away. This decision is that correction applied to the browser.

## Decision

**A passkey is one more way to open a session. It is never the only way, and
it never hides the password form.**

Everything below follows from that sentence, so it is worth being exact about
what it forbids:

- The password form is rendered on the sign-in screen at all times, in full,
  with no "use password instead" link in front of it. The passkey button sits
  BESIDE it, and the form is what the screen is built around.
- The passkey button appears only when the platform can actually serve one —
  `browserSupportsWebAuthn()` and a platform authenticator that answers yes —
  so nothing on that screen offers something that will fail.
- Registration asks for `authenticatorAttachment: "platform"`, which is the
  same thing that button was shown on the strength of. The first version of
  this feature left it open, and the two halves disagreed: the client checked
  for a fingerprint reader and the ceremony then let the browser offer the
  whole menu — this device, another phone over a QR code, a security key on a
  keyring. Pressing a button that says it will read your fingerprint and
  getting a device chooser is the feature failing at the only moment anybody
  sees it. The cost is that a hardware key cannot be registered at all; the
  phone in a pocket and the laptop on a desk, which is what this inventory is
  reached from, are both platform authenticators.
- What none of this can promise is a *biometric*. `userVerification:
  "required"` is satisfied by a fingerprint, a face or the screen-lock PIN,
  and which one appears is the authenticator's decision — WebAuthn has no flag
  for "a sensor, not a PIN". Copy that says "unlock with your fingerprint"
  describes the common case and must never be read as a guarantee.
- A cancelled or failed ceremony leaves the person on a working form and does
  not re-prompt. There is no automatic ceremony on load and no conditional
  mediation: the prompt happens because somebody pressed a button.
- A cancelled ceremony and a FAILED one are two different things and are said
  differently. A dismissal is a quiet note; a failure names the device as the
  place it happened and carries the browser's own word for it. Neither one is
  ever described as a problem on the server — see below.
- Removing every passkey is allowed and needs no warning, because the account
  is not reachable only through them.

A wet thumb, a cut finger, a freshly rebooted phone that has not been unlocked
since boot, a replaced handset, a browser without the API: each of these is a
Tuesday, and none of them may be the reason somebody cannot get into their own
garage.

### The library is a dependency, and this is where that instinct is wrong

This codebase does not add dependencies lightly. The icons are drawn by hand
because nine shapes are not worth a package; the QR symbol is rendered rather
than stored; there is no i18n framework behind `@waymark/i18n`. That instinct
is right, and it is right for the same reason every time: the thing being
avoided is small, bounded, and fails loudly when it is wrong.

WebAuthn verification is none of those things. Verifying a registration means
decoding CBOR, reading a COSE key, checking the client data hash, checking the
RP ID hash, and parsing an attestation object; verifying an assertion means
rebuilding exactly the right byte string and checking an ECDSA or RSA
signature over it, with the flags and the counter read out of the same buffer.
**A subtle mistake there does not fail a test. It silently accepts something
it should not**, which is the one failure mode that never shows up in a
garage and only shows up in somebody else's logs.

So: **`@simplewebauthn/server` on the API and `@simplewebauthn/browser` in the
web client**, version 14. "We could write it ourselves" is true and is not an
argument: we could also write the ECDSA. The reason to hand this to a
maintained library is that its mistakes get found by people who are looking,
and ours would be found by whoever was looking for them.

What was checked rather than assumed, because this library's API has changed
across majors and the shape in most tutorials is two majors old:

- `startRegistration` and `startAuthentication` take **one options object**
  (`{ optionsJSON }`), not the bare options. That changed in v10.
- `verifyRegistrationResponse` answers `registrationInfo.credential`
  (`{ id, publicKey, counter, transports }`). The older
  `credentialID` / `credentialPublicKey` pair is gone; that changed in v13.
- `verifyAuthenticationResponse` takes `credential:` rather than
  `authenticator:`, and answers `authenticationInfo.newCounter` and
  `.userVerified`.
- Both verifiers default `requireUserVerification` to `true`. We pass it
  explicitly anyway, because a default that matters is one this codebase
  should state.

The alternatives were considered and are named so nobody has to rediscover
them: `fido2-lib` is capable and is a heavier API with a slower release
cadence; `@github/webauthn-json` is a browser shim only and solves none of the
server half; and the platform's own `WebAuthn` verification does not exist in
Node.

### Registration is behind a password, and behind a password only

Adding a passkey is minting a credential that outlives the session it was
minted from, and this project has already reasoned about exactly that shape of
act. ADR 18 permits a person with a session to issue a machine token and
forbids a machine token from issuing another, because **a credential that can
issue its own successor cannot be revoked.**

The same sentence applies here with one word changed, so the rule is:

**A passkey may be registered only from a session that was opened with a
password.** A session opened with a passkey may list passkeys and may remove
them, and may not add one.

That costs one password entry on the day somebody adds their laptop after
signing in on their phone, and it buys the thing ADR 18 bought: a stolen
session cannot be turned into a permanent, password-proof way in. Without the
rule, somebody who got one session could register their own authenticator and
still be there after the password had been changed — which is an account
takeover with extra steps, and one nothing on the account sheet would show as
anything other than a device.

Knowing which it was means a session has to remember how it was opened, so
`Session` carries `createdWith: "password" | "passkey"`. That is one column and
it is read on exactly one route.

**Removing is deliberately not symmetric with adding.** Any session may remove
a passkey, and a machine token may do neither — the same refusal, for the same
reason, that `POST /auth/logout` and the machine-token routes already make.
Revoking a credential must always be easy and minting one must always be hard;
an asymmetry in that direction is the safe one, and the reverse is how people
end up not revoking things.

### A passkey opens the same session a password does

The six routes, and the line through the middle of them:

```
POST   /auth/passkey-login/options   no session — how a session begins
POST   /auth/passkey-login           no session — answers the session
GET    /auth/passkeys                any session
POST   /auth/passkeys/options        a PASSWORD-backed session
POST   /auth/passkeys                a PASSWORD-backed session
DELETE /auth/passkeys/:id            any session
```

They are named `passkey-login` rather than `passkeys/authentication` because
they are not operations on a passkey: they are a way to open a session, which
is what `/auth/login` already is in this API's vocabulary.

`POST /auth/passkey-login` answers the same body `POST /auth/login`
answers: an opaque 256-bit token, stored as a SHA-256, sliding over 30 days,
revoked by deleting the row (ADR 6). There is no second kind of session, no
"strong" session, and nothing downstream can tell which door somebody came
through except the one column above.

This is the point of ADR 6 being about a mechanism rather than about a
password. A new way to prove who you are is a new way to reach the same
mechanism.

### The challenge is single-use, short-lived, and bound to its ceremony

A replayable challenge is the whole attack: a signed assertion captured once
and replayed becomes a permanent credential. So a challenge here is a row, not
a value the server re-derives and not a value that lives in a client.

- **A row per ceremony**, created when options are issued and addressed by an
  opaque `ceremonyId` the client sends back. The challenge itself is 32 random
  bytes generated by the library.
- **Single use is a `DELETE`, not a flag.** `consume` deletes the row and
  returns what it deleted, in one statement, so two requests racing the same
  ceremony cannot both be served: the second one deletes nothing and gets
  `null`. A boolean column would have made single-use a read-then-write with a
  window in it.
- **Bound to its ceremony by the delete's `WHERE`.** `consume(id, ceremony)`
  matches on both, so a challenge issued for a registration cannot be spent on
  an authentication even if a handler forgot to check — the statement does not
  match the row. A registration challenge also carries the `userId` it was
  issued to, and finishing verifies the session presenting it is that same
  person.
- **Two minutes.** The browser's own `timeout` in the options is 60 seconds,
  which is what a person sees; the server's window is twice that so that the
  honest slow case — reading the prompt, a thumb that takes three tries — is
  refused by the browser's clock and never by ours, while still being far
  shorter than a stolen ceremony is useful for.
- Expired rows are swept whenever a new ceremony starts, which is one indexed
  delete on the only path that creates them.

### The RP ID and the origin are derived, never configured

The RP ID and the expected origin are what stop a passkey minted for another
site being presented here, and what stop one minted here being usable
elsewhere. Getting them wrong is the failure this ADR is most afraid of,
because a wrong RP ID does not fail at boot: it fails at 1am, on a phone, with
a browser-side `SecurityError` that nothing on the server ever sees. (What the
person reads when that happens is no longer nothing: see *A failed ceremony
says whose failure it was*.)

**So there is no `WAYMARK_RP_ID` and there is no `WAYMARK_WEBAUTHN_ORIGIN`.**
Both are derived from `WAYMARK_PUBLIC_BASE_URL`, which this API already has,
already validates hard, and already uses for the thing with the worst failure
mode in the product — the URL inside a QR code glued to a box.

- **RP ID** is that URL's hostname: `waymark.idemcloud.uk` in the deployment,
  `localhost` in a checkout.
- **Expected origin** is that URL's origin, exactly: scheme, host and port.

This follows the reasoning `config.ts` already gives twice, for the image
processor and for the web root: *two settings that can disagree is one more
state than the feature has, and the extra state is always the one that
breaks.* A separate RP ID could be set to `idemcloud.uk` while the app is
served from `waymark.idemcloud.uk`, or left at `localhost` in a production
compose file, and both of those are deployments that boot happily and refuse
every fingerprint.

**What happens when it is wrong is that the API does not start.** WebAuthn
runs only in a secure context, so a public base URL that is neither `https:`
nor a loopback host is one no browser will ever run a ceremony against.
`loadConfig` refuses it by name, at boot, with a sentence that says which
variable and why — the same treatment `WAYMARK_ALLOWED_ORIGINS` and
`WAYMARK_TRUSTED_PROXIES` already get, and for the reason that file states:
"a security hole that looks exactly like a working deployment. Failing to
start is the only honest response."

The cost is named: a deployment on `http://192.168.1.10:5173` used to boot and
now does not. That deployment could never install the PWA either — a service
worker needs the same secure context — so what it loses is a configuration
that was already half broken, and what it gains is being told.

The residual risk this cannot remove is a base URL that is secure and points
at the wrong host. Nothing on the server can detect that, because the server
never sees the address bar. What it does instead is make it one value rather
than three, and that value is already the one somebody checks when a QR code
does not scan.

### User verification is required

`userVerification: "required"` on both ceremonies, and
`requireUserVerification: true` on both verifications, so the UV flag is
checked in the signed bytes rather than trusted from the ceremony's request.

This is the decision with a real cost and it is taken deliberately. "Preferred"
would let an authenticator that merely detected a touch satisfy a ceremony
that a person believes proved their fingerprint — a passkey in name only, and
worse than no passkey, because it looks like the strong thing. The whole
purpose here is the fingerprint.

What it costs: an authenticator with no PIN, no biometric and no screen cannot
register — an old U2F key, for instance. That person keeps the password form,
which is present, complete and unchanged, and the refusal says plainly that
the device must be able to check that it is you. Given that the one person
this was built for is holding a phone with a fingerprint reader, refusing the
weak case is cheap and the alternative is silent.

### Sign-in asks for no username

`residentKey: "required"` and `requireResidentKey: true`, so every passkey is
discoverable, and the authentication options carry an EMPTY
`allowCredentials`. The browser asks which passkey to use, the assertion
carries the credential id, and the server looks up the person from it.

Two reasons, and the second is the stronger one:

1. **Typing a username to then use a fingerprint is the typing the feature
   exists to remove.** One shared inventory with a handful of accounts (ADR 5)
   does not need a directory step.
2. **The options endpoint is the only unauthenticated thing this ADR adds, and
   an empty `allowCredentials` means it can answer without knowing who is
   asking.** A username-first flow would have to answer "here are the
   credential ids registered to `dario`" to an anonymous caller, which is an
   account enumeration oracle and a list of somebody's devices. This endpoint
   returns a random challenge and nothing else, to everybody, always.

The cost of resident keys is space on the authenticator, which is a real limit
on old security keys and not one on any phone or laptop made this decade.

### The signature counter, knowing that most authenticators do not keep one

The counter exists so that a cloned authenticator can be noticed: a genuine
one only ever counts up, so a signature carrying a count at or below one
already seen is evidence that two things are answering for one credential.

`@simplewebauthn/server` implements the same rule and would refuse the
assertion first, with a message that cannot name the device. So the comparison
is made here instead — the library is handed a stored counter of zero, which
is the one argument it uses for that check and nothing else — and the refusal
this product makes is one a person can act on. An integer comparison is not
what ADR 19 refuses to hand-write; CBOR, COSE and a signature over the right
bytes are.

The complication is that **most of the authenticators this product will
actually meet always send zero**. Platform passkeys on iOS and Android, and
anything synced through a password manager, do not keep a per-credential
counter, because a credential that exists on three devices cannot have one
honest counter. Treating zero as a regression would refuse every passkey on
the second use.

So the rule is exactly this:

- Both the stored count and the presented count are zero: **the authenticator
  does not keep a counter.** Accept, and store zero.
- The presented count is greater than the stored one: accept, and store it.
- Anything else — including a presented zero against a stored count that is
  not — is a **clone signal**: the assertion is refused, and the stored counter
  is deliberately NOT moved, so a genuine authenticator that is still ahead
  keeps working the moment whatever was answering for it stops. The refusal
  names the passkey, because the only useful thing to say is which device to
  remove.

**What it does not do is delete the passkey.** Deleting one on this signal is
destroying somebody's credential on a heuristic that a buggy authenticator can
trigger, and the person may be standing in a garage at the time. Refusing is
enough: the door stays shut, the password still works, the account sheet shows
the passkey with its last use, and the person can remove it themselves. The
sentence they read says that this passkey could not be trusted for this
sign-in and that they should remove it and register again.

This is the one guarantee in this ADR whose real-world behaviour nobody here
has observed, because none of us has a cloned authenticator. What is tested is
the rule, against a software authenticator that counts however the test tells
it to.

### Several per person, and removing the last one is safe

A phone and a laptop are two authenticators, and a lost phone must not be a
lost account. So there is no limit of one, the list is per person, and each
one carries a label the person typed and the date it was last used.

**Removing the last passkey cannot lock anybody out, and the reason is
structural rather than a check.** There is no state in which a passkey is the
only way into an account: the password form is always on the screen, the
password was set by `create-user` from a shell and is unchanged by any of
this, and registration itself requires that password. A "you must keep one"
rule would be guarding against a situation this design cannot produce — and
such a rule has its own failure mode, which is somebody who thinks a
credential has leaked being told they may not remove it.

The only thing removing every passkey does is make the button stop appearing.

### Passkeys are somebody's, where a machine token is the house's

ADR 18 deliberately makes every machine token visible to everybody who could
have minted one, because a machine token is a key to the shared inventory and
a credential nobody can see is a credential nobody revokes.

**A passkey is the opposite kind of thing and is listed per person.** It is not
a key to the house; it is a particular person's particular device, and the list
of somebody's authenticators is information about them — which laptop they own,
whether they carry a security key, how many devices they have. Nothing about
the shared inventory needs that.

This is not the per-user scoping ADR 5 refused. ADR 5 refused an owner column
on `StorageUnit`, `Item` and `Photo` and a query scoped by a person, and none
of that appears here: no inventory query changes, no entity gains a column,
and every authenticated human still performs every inventory operation. A
passkey is scoped for the same reason a session is — `POST /auth/logout`
already ends only your own — and a credential belonging to a person is the one
thing in this system that has always had an owner.

### What is stored, and what is refused

A public key is not a secret; the list of a person's authenticators is still
information about them. So the row holds what verification needs and stops:

`credentialId`, `publicKey`, `signCount`, `transports`, the `label` the person
typed, `createdAt`, `lastUsedAt`, and the `userId`.

Not stored, on purpose:

- **Attestation.** `attestationType: "none"`, so the authenticator is never
  asked to prove its make and model. Asking would collect exactly the
  identifying information this paragraph exists to avoid, and there is nothing
  here to do with the answer: a household inventory has no authenticator
  allowlist and never will.
- **The AAGUID**, for the same reason. It names the model of the device.
- **`credentialDeviceType` and `credentialBackedUp`.** They say whether a
  credential is synced to somebody's cloud account. It is genuinely useful
  information for an enterprise policy and this product has no policy to apply
  it to, so it is a fact about somebody's life stored for nothing.

`transports` is kept because it is not about the person: it is a hint the
browser uses to draw the right prompt, and leaving it out makes the ceremony
slower on some platforms for no gain.

### A failed ceremony says whose failure it was

The first version of this feature recognised exactly one thing a browser could
do other than hand back a credential: a dismissed prompt. Everything else — and
"everything else" is the whole of WebAuthn's documented failure space — was
re-thrown raw, landed in `describeFailure`, matched none of the API's failure
kinds, and became **"Waymark had a problem answering. Try again in a moment."**

That sentence was read on a real phone. The server logs for the same minute
show `POST /auth/passkeys/options` answering **200** twice and the finishing
`POST /auth/passkeys` never arriving, which is what a `DOMException` inside the
browser looks like from the outside. The app blamed the one component that had
done nothing wrong, and it sent its owner to wait for a server that was already
answering.

So a ceremony that failed on the device is now **a type of its own**,
`PasskeyCeremonyFailed`, beside `PasskeyCancelled` and with the same standing:
neither of them is an HTTP failure, because neither of them ever reached HTTP.
It carries the `DOMException` name the browser raised and `@simplewebauthn`'s
code when the library had one, and those two strings are carried all the way
into the sentence a person reads.

Three rules hold that sentence together:

1. **It is the device's failure and it says so.** "Your device could not finish
   the passkey, so Waymark was never asked" is what happened. Nothing about the
   server appears in it.
2. **It says the password still works and nothing was lost.** That is this
   ADR's first sentence, repeated at the only moment somebody could doubt it.
3. **It carries the reason verbatim, untranslated.** `NotSupportedError
   (ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG)` goes into the
   sentence as it is, in both languages, exactly as `failure.asTheApiPutIt`
   already passes the API's own prose through. It is a token the specification
   defines in English; translating it would invent a name for a thing that has
   no other name, and the person who has to report the failure has no console.

Three names get a better sentence than the general one, because each has a
different next step: `InvalidStateError` means this device already holds a
passkey for this account, `NotSupportedError` means it cannot make the kind we
ask for, and `SecurityError` means the address the app is served from does not
match what the server issued the options for — which is the RP ID failure this
file spends a section being afraid of, and it is now legible from the screen.

**A dismissal is deliberately untouched by all of this.** `NotAllowedError`,
`AbortError` and `ERROR_CEREMONY_ABORTED` still become `PasskeyCancelled`,
still draw a quiet note rather than an alert, and still leave the password form
alone. A wet thumb is not a failure and must never be shown as one.

The same reasoning applies once more, one level out: `describeFailure` used to
answer `failure.server` for **any** throwable that was not an `ApiError`,
because `failureKindOf` reasonably reports `SERVER` when there is no HTTP
status to read. That reading is fine for sorting statuses and wrong as a thing
to say out loud, so the sentence for "this never reached the API" is now its
own and says so. Every failure the API actually made keeps the sentence it had.

## Consequences

- The owner opens the PWA on his phone, presses one button, touches the
  sensor, and is in — with the password form still on that screen, unmoved.
- `Session` gains one column, `createdWith`, read by exactly one route.
- Two tables and two ports appear in `apps/api/src/auth`, both measured by the
  shared contract suites, so the in-memory fakes and the Prisma adapters stay
  provably interchangeable. `packages/domain` is untouched, which is the
  sentence ADR 5 and ADR 17 both end on: authentication is not inventory.
- Two dependencies are added, and this file is the argument for them.
- A ceremony that fails on the device is named, and what the browser called it
  reaches the person who has to report it. No client screen describes a
  browser's failure as a problem on the server any more.
- `WAYMARK_PUBLIC_BASE_URL` now decides one more thing, and a deployment that
  sets it to a plain-HTTP non-loopback address stops booting.
- There is no new configuration variable, and therefore no new pair of
  settings that can disagree.
- What nobody here has observed, and what is therefore asserted against a
  library's contract and a software authenticator rather than against a real
  one, is written down in the report that accompanies this change: no browser,
  no phone and no security key took part in any of these tests.
