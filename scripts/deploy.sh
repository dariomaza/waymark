#!/usr/bin/env bash
#
# Deploys Waymark to the homelab box, and refuses to pretend it did.
#
# ## Why this file exists
#
# The deploy used to be four commands pasted into a terminal: rsync, then
# `docker compose up -d --build` over SSH, then open the hostname and see the
# app. On 2026-09-24 that shipped a broken image. `packages/tokens` had been
# added and `docker/api.Dockerfile` — which enumerates the workspace packages it
# copies, by hand — had not been told, so the image failed at
# `pnpm --filter @waymark/web build`.
#
# Every signal that should have stopped it worked. CI went red on that exact
# commit, eleven minutes before the deploy. Nobody looked. And
# `docker compose up -d --build` left the PREVIOUS container running and
# answering 200, so the deployment looked healthy while serving the old bundle.
# It was found by comparing a hashed JavaScript filename by hand.
#
# "Remember to check CI" is not a fix; it is the thing that just failed. So the
# checks live here, before anything touches the server, and the proof lives at
# the end: the running container reports the commit it was built from, and this
# script exits non-zero unless that is the commit it just shipped. See ADR 23.
#
# ## What is tested and what is not
#
# The API half of this is covered by tests: `config.test.ts` for reading
# `WAYMARK_COMMIT`, `the-api-says-which-commit-it-is.test.ts` for `GET /health`,
# and `the-image-is-told-which-commit-it-is.test.ts` for the Dockerfile and
# compose plumbing that carries the value in. CI builds the image AND runs it,
# asserting it reports the commit it was built with.
#
# This script is not unit-tested. It is covered by having been run — every
# refusal below, and one real deploy end to end.
#
# ## Usage
#
#   scripts/deploy.sh            deploy HEAD
#   scripts/deploy.sh --check    run every gate and stop before touching the box
#
# ## The escape hatch
#
#   WAYMARK_DEPLOY_WITHOUT_GITHUB=1 scripts/deploy.sh
#
# One hatch, and it names its dependency rather than the check it removes: it
# drops the two gates that need github.com to answer — that HEAD is on the
# `github` remote, and that CI passed for it. Everything else still runs.
#
# It exists because the alternative is worse. A gate with no way past it is not
# a gate somebody obeys at two in the morning with GitHub down; it is a gate
# somebody walks around, by pasting the rsync and the ssh out of this file — and
# that loses the checks AND the verification, which is the half that actually
# proves something. A hatch that skips one gate and keeps the proof is strictly
# better than the bypass it competes with.
#
# What it cannot skip:
#
#   * A dirty working tree. The bytes rsync ships would then exist in no commit,
#     and the image would report a SHA whose tree is not what is running. That
#     does not weaken the proof, it makes it a lie.
#   * The verification. Skipping it returns this deploy to exactly the state
#     that caused the incident: green-looking, unproven.
set -euo pipefail

readonly REMOTE="${WAYMARK_DEPLOY_REMOTE:-DarioMaza@100.108.95.2}"
readonly REMOTE_PATH="${WAYMARK_DEPLOY_PATH:-/DATA/AppData/waymark/src}"
readonly PUBLIC_URL="${WAYMARK_DEPLOY_PUBLIC_URL:-https://waymark.idemcloud.uk}"
readonly GITHUB_REPO="${WAYMARK_DEPLOY_GITHUB_REPO:-dariomaza/waymark}"
# ZimaOS keeps `/DATA/.docker` root-owned and unreadable by the login user, and
# the Docker CLI responds by silently finding no plugins at all rather than
# saying it was denied. Pointing this somewhere readable is what makes
# `docker compose` exist on that box. See the README.
readonly REMOTE_DOCKER_CONFIG="${WAYMARK_DEPLOY_DOCKER_CONFIG:-/DATA/AppData/waymark/.docker}"

# The port the API listens on inside the host's network namespace. The compose
# file binds it to loopback, so this is reachable only from the box itself,
# which is why the first verification goes over SSH.
readonly REMOTE_PORT="${WAYMARK_DEPLOY_PORT:-3000}"

# How long to wait for a CI run that is still going.
readonly CI_WAIT_SECONDS="${WAYMARK_DEPLOY_CI_WAIT_SECONDS:-900}"
# Thirty seconds between polls, and the number is not arbitrary: an
# unauthenticated GitHub API caller gets 60 requests an hour from one address,
# and `gh` is not logged in on this machine. A tighter poll would spend the
# whole budget waiting for one run and then start failing with a rate limit,
# which reads exactly like CI being broken.
readonly CI_POLL_SECONDS=30

# How long the new container may take to answer after `up -d`. It runs
# `prisma migrate deploy` before it listens.
readonly BOOT_WAIT_SECONDS="${WAYMARK_DEPLOY_BOOT_WAIT_SECONDS:-180}"
readonly BOOT_POLL_SECONDS=3

if [ -t 2 ]; then
  readonly BOLD=$'\033[1m' RED=$'\033[31m' GREEN=$'\033[32m' DIM=$'\033[2m' OFF=$'\033[0m'
else
  readonly BOLD='' RED='' GREEN='' DIM='' OFF=''
fi

step() { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$OFF" >&2; }
note() { printf '    %s%s%s\n' "$DIM" "$*" "$OFF" >&2; }
good() { printf '    %s%s%s\n' "$GREEN" "$*" "$OFF" >&2; }

# Every refusal comes through here, so there is exactly one way this script says
# no and exactly one exit code for it.
refuse() {
  printf '\n%s%sREFUSING TO DEPLOY%s\n' "$BOLD" "$RED" "$OFF" >&2
  printf '%s\n\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '3,60p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

check_only=false
case "${1:-}" in
  --check) check_only=true ;;
  -h | --help) usage ;;
  '') ;;
  *) refuse "Unknown argument: $1. This script takes --check or nothing." ;;
esac

without_github=false
if [ -n "${WAYMARK_DEPLOY_WITHOUT_GITHUB:-}" ]; then
  without_github=true
fi

for tool in git rsync ssh curl jq; do
  command -v "$tool" >/dev/null 2>&1 ||
    refuse "\`$tool\` is not on this machine, and every gate below needs it."
done

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) ||
  refuse "This is not a git checkout, so there is no commit to deploy."
cd "$repo_root"

# ---------------------------------------------------------------------------
# Gate 1: the working tree
#
# First because it is the cheapest, and because it is the one refusal that
# nothing may skip. rsync ships the WORKING TREE; the image reports the commit
# this script hands it. If the two differ, every check after this one is
# measuring a claim that was already false.
# ---------------------------------------------------------------------------
step "The working tree"

dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
  refuse "$(printf 'The working tree is not clean:\n\n%s\n\nrsync ships these files and the image would report a commit whose tree is\nnot what is running. Commit them, stash them, or throw them away.' "$dirty")"
fi
good "clean"

commit=$(git rev-parse HEAD)
subject=$(git log -1 --pretty=%s)
note "$commit"
note "$subject"

# ---------------------------------------------------------------------------
# Gate 2: the commit exists somewhere other than this laptop
#
# `origin` is the bare repository on the NAS and `github` is the public one.
# Reachability, not tip equality: a commit that an ancestor of a pushed branch
# is genuinely on that remote.
# ---------------------------------------------------------------------------
step "The commit is pushed"

is_on_remote() {
  local remote=$1

  git fetch --quiet "$remote" 2>/dev/null ||
    refuse "Could not fetch \`$remote\`. It is unreachable, and this script
cannot tell a commit that was never pushed from a remote that is down.

If this is github.com and the box is fine, this is what the hatch is for:

  WAYMARK_DEPLOY_WITHOUT_GITHUB=1 $0"

  [ -n "$(git branch --remotes --contains "$commit" --list "${remote}/*")" ]
}

remotes=(origin)
if $without_github; then
  note "skipping the \`github\` remote (WAYMARK_DEPLOY_WITHOUT_GITHUB)"
else
  remotes+=(github)
fi

for remote in "${remotes[@]}"; do
  is_on_remote "$remote" ||
    refuse "HEAD is not on \`$remote\`.

  git push $remote HEAD

A deploy of a commit that exists only here is a deploy nobody can reproduce,
and one laptop failure from being unrecoverable."
  good "on $remote"
done

# ---------------------------------------------------------------------------
# Gate 3: CI passed for THIS commit
#
# The repository is public, so this needs no token — which matters, because
# `gh` is not authenticated on this machine and a gate that depends on a login
# is a gate that stops working silently.
#
# The endpoint takes the full 40-character SHA and nothing else. A short SHA
# answers `total_count: 0`, which is indistinguishable from "no run yet" —
# verified, not assumed.
#
# Four answers, and three of them are refusals:
#
#   no run        GitHub has never seen this commit, or the workflow has not
#                 started. Not a failure, not something waiting will fix on its
#                 own if the push never happened.
#   in progress   The only one where waiting is the right answer, so this waits.
#   failed        The incident. Refuse, and name the run.
#   inconclusive  Everything cancelled or skipped. Nothing was proved, which is
#                 not the same as something passing.
# ---------------------------------------------------------------------------
step "CI for $commit"

if $without_github; then
  printf '\n%s%s  !! CI WAS NOT CHECKED (WAYMARK_DEPLOY_WITHOUT_GITHUB)%s\n' \
    "$BOLD" "$RED" "$OFF" >&2
  printf '%s     Nothing has proved this commit builds an image that runs.%s\n' \
    "$DIM" "$OFF" >&2
else
  ci_runs() {
    local response code

    response=$(curl --silent --show-error --location --max-time 20 \
      --write-out '\n%{http_code}' \
      --header 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/${GITHUB_REPO}/actions/runs?head_sha=${commit}") ||
      refuse "Could not reach api.github.com.

If GitHub is down and the box is not, this is what the hatch is for:

  WAYMARK_DEPLOY_WITHOUT_GITHUB=1 $0"

    code=${response##*$'\n'}
    body=${response%$'\n'*}

    if [ "$code" != "200" ]; then
      refuse "$(printf 'api.github.com answered %s:\n\n%s\n\nThat is GitHub refusing the question, not CI failing. A 403 here is the\nunauthenticated rate limit — sixty requests an hour from this address.' \
        "$code" "$(jq -r '.message // .' <<<"$body" 2>/dev/null || printf '%s' "$body")")"
    fi

    printf '%s' "$body"
  }

  waited=0
  while true; do
    runs=$(ci_runs)

    total=$(jq -r '.total_count' <<<"$runs")
    # `failure` is the incident. `timed_out` and `startup_failure` are the same
    # answer wearing different words: the run did not prove the commit.
    failed=$(jq -r '[.workflow_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "startup_failure")] | length' <<<"$runs")
    pending=$(jq -r '[.workflow_runs[] | select(.status != "completed")] | length' <<<"$runs")
    passed=$(jq -r '[.workflow_runs[] | select(.conclusion == "success")] | length' <<<"$runs")

    if [ "$total" -eq 0 ]; then
      refuse "GitHub has no workflow run for $commit.

That is not CI failing and it is not CI running. Either the push has not
reached github.com yet, or no workflow matched this commit. Look at

  https://github.com/${GITHUB_REPO}/commits/${commit}

and run this again when there is a run to read."
    fi

    # Checked before `pending`, deliberately. One run red and another still
    # going is already an answer, and it is no.
    if [ "$failed" -gt 0 ]; then
      refuse "$(printf 'CI failed for this commit:\n\n%s\n\nThis is exactly the state that shipped a broken image once already. Fix it\nand push again.' \
        "$(jq -r '.workflow_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "startup_failure") | "  \(.name): \(.conclusion)\n  \(.html_url)"' <<<"$runs")")"
    fi

    if [ "$pending" -gt 0 ]; then
      if [ "$waited" -ge "$CI_WAIT_SECONDS" ]; then
        refuse "CI is still running after ${CI_WAIT_SECONDS}s. Waiting longer is reasonable;
deciding on its behalf is not.

  https://github.com/${GITHUB_REPO}/commits/${commit}"
      fi

      note "$pending run(s) still going — waiting (${waited}s of ${CI_WAIT_SECONDS}s)"
      sleep "$CI_POLL_SECONDS"
      waited=$((waited + CI_POLL_SECONDS))
      continue
    fi

    if [ "$passed" -eq 0 ]; then
      refuse "$(printf 'Every run for this commit finished without passing:\n\n%s\n\nCancelled and skipped are not green. Nothing here proves this commit builds\nan image that runs.' \
        "$(jq -r '.workflow_runs[] | "  \(.name): \(.conclusion // .status)"' <<<"$runs")")"
    fi

    good "$passed run(s) passed"
    break
  done
fi

if $check_only; then
  step "--check: every gate passed, and nothing was touched"
  exit 0
fi

# ---------------------------------------------------------------------------
# Ship it
# ---------------------------------------------------------------------------
step "Copying the tree to $REMOTE:$REMOTE_PATH"

# `--delete`, because without it a file deleted in this commit survives on the
# box and the tree there stops being the tree the commit describes. Excluded
# paths are not deleted by rsync, so `node_modules` and the rest are safe.
rsync --archive --compress --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude .turbo \
  --exclude coverage \
  --exclude '*.db' \
  ./ "${REMOTE}:${REMOTE_PATH}/" ||
  refuse "rsync failed. Nothing on the box was changed by a partial copy that
compose has not been asked to build yet."

good "copied"

# ---------------------------------------------------------------------------
# Build and recreate, as two commands
#
# NOT `docker compose up -d --build`. That is one command with one exit code for
# two outcomes, and the outcome it hides is the one that caused the incident: a
# failed build leaves the previous container running and answering 200. The
# compose command does exit non-zero — but it exits non-zero at the end of
# several minutes of log, after which `docker ps` shows a healthy container, and
# the person reading it concludes the deploy worked.
#
# Split, the build has an exit code of its own and nothing follows it. If the
# image does not build, `up` is never reached and the box keeps serving the old
# code untouched — which is the correct outcome for a build that failed: a
# broken image is not a reason to take the inventory offline. What changes is
# that nobody is told a deploy happened.
#
# The cost is one more SSH round trip, and that the old container survives a
# failed build. The second one is only a cost if somebody believes it is the new
# one, and the verification below is what makes that impossible.
# ---------------------------------------------------------------------------
remote_env=$(printf 'DOCKER_CONFIG=%q WAYMARK_COMMIT=%q WAYMARK_PUBLIC_BASE_URL=%q' \
  "$REMOTE_DOCKER_CONFIG" "$commit" "$PUBLIC_URL")

step "Building the image on the box"
ssh "$REMOTE" "cd $(printf '%q' "$REMOTE_PATH") && $remote_env docker compose build" ||
  refuse "The image did not build.

The container that was already running has NOT been touched: it is still up and
still serving the previous commit, which is correct — a build that failed is not
a reason to take the inventory down. Nothing was deployed."

good "built"

step "Recreating the container"
ssh "$REMOTE" "cd $(printf '%q' "$REMOTE_PATH") && $remote_env docker compose up -d" ||
  refuse "\`docker compose up -d\` failed. The box may be serving the old commit,
the new one, or nothing. Look:

  ssh $REMOTE 'cd $REMOTE_PATH && DOCKER_CONFIG=$REMOTE_DOCKER_CONFIG docker compose ps'"

good "recreated"

# ---------------------------------------------------------------------------
# The proof
#
# Two assertions, because they fail for different reasons and a deploy that
# cannot tell them apart sends somebody to the wrong layer.
#
#   on the box      the container that is running was built from this commit.
#   through the
#   tunnel          and the world can reach it. A container that is perfect and
#                   a hostname that answers nothing is not a deploy that worked.
# ---------------------------------------------------------------------------
step "What is actually running"

# `commit` absent and `commit` null are different sentences, and this reports
# them as such: no key at all means an image from before the gate existed, null
# means an image built without being told which commit it is.
reported_commit() {
  jq -r 'if has("commit") then (.commit // "<null>") else "<absent>" end' 2>/dev/null ||
    printf '<unreadable>'
}

waited=0
running=''
while [ "$waited" -lt "$BOOT_WAIT_SECONDS" ]; do
  health=$(ssh "$REMOTE" "curl --silent --show-error --max-time 5 http://127.0.0.1:${REMOTE_PORT}/health" 2>/dev/null) || health=''

  if [ -n "$health" ]; then
    running=$(reported_commit <<<"$health")
    [ "$running" = "$commit" ] && break
  fi

  sleep "$BOOT_POLL_SECONDS"
  waited=$((waited + BOOT_POLL_SECONDS))
done

case "$running" in
  "$commit")
    good "the container on the box reports $commit"
    ;;
  '')
    refuse "Nothing answered on http://127.0.0.1:${REMOTE_PORT}/health after ${BOOT_WAIT_SECONDS}s.

The image built and the container was recreated, so it started and then did not
come up. Migrations run before the port opens:

  ssh $REMOTE 'cd $REMOTE_PATH && DOCKER_CONFIG=$REMOTE_DOCKER_CONFIG docker compose logs --tail 80 api'"
    ;;
  '<absent>')
    refuse "The running container answers /health with no \`commit\` at all.

That is an image from before this gate existed — the container was not replaced.
It is serving code older than this commit and it looks perfectly healthy, which
is the entire failure this script was written for."
    ;;
  '<null>')
    refuse "The running container says it does not know which commit it is.

The image built without \`WAYMARK_COMMIT\`, so compose did not forward the build
argument. Nothing can prove which code is serving, which is the same as not
having deployed."
    ;;
  *)
    refuse "The running container reports a different commit.

  deployed: $commit
  running:  $running

The container was not replaced, or it was replaced by a stale image."
    ;;
esac

step "What the world sees"

public_health=$(curl --silent --show-error --location --max-time 20 "${PUBLIC_URL}/health") ||
  refuse "${PUBLIC_URL}/health did not answer.

The container on the box is correct and reports $commit, so this is the tunnel
and not the deploy. \`cloudflared\` shares the host's network namespace and
reaches the API on loopback."

public_commit=$(reported_commit <<<"$public_health")
if [ "$public_commit" != "$commit" ]; then
  refuse "${PUBLIC_URL} is serving a different commit than the box is running.

  deployed:      $commit
  on the box:    $running
  at the tunnel: $public_commit

The tunnel is pointed at something else."
fi

good "$PUBLIC_URL reports $commit"

printf '\n%s%sDEPLOYED%s %s\n%s\n\n' "$BOLD" "$GREEN" "$OFF" "$commit" "$subject" >&2
