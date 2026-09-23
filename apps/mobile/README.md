# Building the Android app

The APK is the only build this repository produces for a phone. Everything
below is run from **this directory**, `apps/mobile`, which is where EAS looks
for `eas.json`.

## Once, per Expo account

```sh
npx eas-cli login
npx eas-cli init            # creates the EAS project and writes its id

npx eas-cli env:set --name EXPO_PUBLIC_WAYMARK_API_URL \
  --value https://your.waymark.host \
  --environment production --visibility plaintext
```

## Every time

```sh
npx eas-cli build --platform android --profile production
```

It finishes with a URL. Open it on the phone and install the `.apk`.

## What `EXPO_PUBLIC_WAYMARK_API_URL` does

It is **where the API is, as the phone sees it** — the same hostname you type
into a browser to reach your Waymark, with no trailing slash.

It is not read when the app starts. It is **baked into the JavaScript** when
the bundle is built, so an APK carries the address it was built with for as
long as that APK exists, and changing the variable means building again. The
default is `http://127.0.0.1:3000`, which is loopback *inside the phone* — an
APK built without the variable reaches nothing at all, which is why the build
refuses to run without it and says so by name.

It decides one more thing. Every printed label encodes
`<WAYMARK_PUBLIC_BASE_URL>/u/<publicId>`, and one container serves the API and
the web client on one origin, so the host on a sticker is the host of this
address. `app.config.ts` takes the hostname from it and puts it in the Android
intent filter — which is what makes the phone's own camera offer to open a box
in Waymark instead of in a browser. That only happens for an `https:` address:
anything else claims no host, and labels keep opening the web client exactly
as they did before.

It is public and that is correct. The address of a server is not a credential.
The credential is the session token, and it lives in the Android Keystore by
way of `expo-secure-store`.

## Pointing the app at your own Waymark

Nothing in this repository names a server, on purpose — it is public, and a
hostname committed here would be a hostname every fork silently inherited,
which is a stranger's inventory receiving somebody else's session token.

So the address lives on **your** Expo account rather than in the tree. Run the
`env:set` command above with your own hostname and build. You change no
tracked file, so there is nothing to conflict the next time you pull.

For a local run against a machine on your own network, put it in a `.env` here
instead — see `.env.example`. That file is gitignored and never reaches an EAS
build.

## Versions

`version` in `app.json` is the one a person reads in Android's app list, and
it is written by hand. `versionCode` — the number Android compares to decide
whether an install is an upgrade — is kept by EAS and incremented on every
build, because an APK that will not install over the previous one reports only
"App not installed", with no reason.

## Checking it without building

```sh
pnpm --filter @waymark/mobile typecheck
pnpm --filter @waymark/mobile test
npx expo-doctor
npx expo config --type public          # what the build will actually see

EXPO_PUBLIC_WAYMARK_API_URL=https://your.waymark.host \
  npx expo export --platform android   # the real Metro bundle
```
