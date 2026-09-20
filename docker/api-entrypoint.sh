#!/bin/sh
# Applies the migrations, then hands over to the server.
#
# `migrate deploy` and not `migrate dev`: it applies exactly the migrations that
# are checked in, never generates one, and never resets anything. On a homelab
# box the alternative is a schema that drifts from the code silently until a
# query fails at two in the morning.
#
# It runs here rather than in a separate one-shot container because there is one
# API process and one SQLite file: a migration job would be a second container
# that has to be ordered against this one to do what `&&` already does.
set -eu

echo "ariadna: applying migrations to ${DATABASE_URL}"
node_modules/.bin/prisma migrate deploy

exec "$@"
