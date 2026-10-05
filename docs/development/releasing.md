# Releasing

A version is decided from the commits and published when a person says so.

On every push to `main`, release-please reads the conventional commits since
the last release and keeps one pull request open that bumps the root
`package.json`, `.release-please-manifest.json` and `expo.version` in
`apps/mobile/app.json`, and writes `CHANGELOG.md`. `fix:` is a patch and `feat:`
a minor; while this is 0.x, a breaking change is a minor too. **Merging that
pull request is the release.** It then runs the whole of CI against the tagged
commit, builds the APK on EAS, checks the build is exactly that commit and
version, and attaches it to the GitHub release.

The one secret it needs is `EXPO_TOKEN`. The signing keystore never leaves EAS
— an Android app's identity is its package name plus that key, and a key on one
laptop is one disk failure from never shipping an update again.

A tag pushed by hand (`git tag v0.2.0 && git push github v0.2.0`) goes through
the same `release.yml`, for the day release-please is the thing that is broken.
