# Development

Waymark is a pnpm monorepo. The packages and what each one is are in
[Architecture](../architecture.md); why they are shaped that way is in the
[decisions](../decisions/).

The commands, the test baselines, the rules every change follows (strict TDD,
mutation testing, every visible string through `packages/i18n`, no hex literals
in either client) and the traps this repository has already fallen into live in
one place, [`CLAUDE.md`](../../CLAUDE.md), so they are not repeated here.

- [Continuous integration](./ci.md): what CI runs, and why each step is there.
- [Releasing](./releasing.md): how a version is cut.

## This site

The site is built by VitePress from the Markdown in `docs/`, the same files
GitHub shows. Its theme colours and its logo are generated from
`packages/tokens` when it builds, and the build fails on a link that does not
resolve.

```sh
pnpm --filter @waymark/docs dev     # http://localhost:5173/waymark/
pnpm --filter @waymark/docs build
```
