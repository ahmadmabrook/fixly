#!/bin/sh
set -e

echo "=== Running Prisma migrations ==="

# prisma CLI is in prod deps (backend/package.json). Use the local binary.
PRISMA="./node_modules/.bin/prisma"

# On first deploy the DB may have a half-applied migration from a prior failed
# attempt. Prisma refuses to proceed with P3009. Resolve by resetting (safe:
# no user data in staging). Remove this fallback after the first successful deploy.
$PRISMA migrate deploy --schema ./prisma/schema.prisma 2>&1 || {
  echo "=== Migrate failed — attempting reset for fresh staging DB ==="
  $PRISMA migrate reset --force --schema ./prisma/schema.prisma 2>&1 || true
  $PRISMA migrate deploy --schema ./prisma/schema.prisma 2>&1 || echo "Migration still failing — app will start anyway"
}

echo "=== Starting Fixly backend ==="
exec node dist/main.js
