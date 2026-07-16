#!/bin/sh
set -e

echo "=== Running Prisma migrations ==="

# prisma CLI is in prod deps (backend/package.json). Use the local binary.
PRISMA="./node_modules/.bin/prisma"

# A failed migration MUST fail the deploy. Two rules here, both learned the hard way:
#
#  1. Never destroy data automatically. `migrate reset --force` DROPS AND RECREATES
#     the database. It previously ran as an automatic fallback on ANY migrate
#     failure — including transient ones (connection blip, lock timeout, a
#     half-applied migration from a prior attempt). In an image that ships with
#     NODE_ENV=production, that turns a 5-second network hiccup into total,
#     unrecoverable data loss with no human in the loop. It is now opt-in ONLY,
#     via ALLOW_MIGRATE_RESET=true, which no production environment should ever set.
#
#  2. Never start against an unmigrated schema. The app previously started anyway
#     ("app will start anyway") after migrations failed. Serving traffic on a schema
#     the code doesn't match yields corrupt writes and confusing 500s — strictly
#     worse than a failed deploy, because the orchestrator would keep the old,
#     healthy pods if we just exit non-zero.
if ! $PRISMA migrate deploy --schema ./prisma/schema.prisma 2>&1; then
  echo "=== Migration failed ==="

  if [ "$ALLOW_MIGRATE_RESET" = "true" ]; then
    # Explicit, deliberate opt-in for a DISPOSABLE database (fresh staging/ephemeral
    # preview envs only). Destroys all data in the target database.
    echo "=== ALLOW_MIGRATE_RESET=true — resetting the database (ALL DATA WILL BE LOST) ==="
    $PRISMA migrate reset --force --schema ./prisma/schema.prisma 2>&1
    $PRISMA migrate deploy --schema ./prisma/schema.prisma 2>&1
  else
    echo "Refusing to start: the database schema is not migrated." >&2
    echo "Fix the migration and redeploy. If — and only if — this database is" >&2
    echo "disposable and you accept LOSING ALL ITS DATA, set ALLOW_MIGRATE_RESET=true." >&2
    exit 1
  fi
fi

echo "=== Starting Fixly backend ==="
exec node dist/main.js
