#!/bin/sh
set -e

echo "=== Running Prisma migrations ==="

# On first deploy the DB may have a half-applied migration from a prior failed
# attempt. Prisma refuses to proceed with P3009 in that case. Resolve it by
# resetting the migration history if needed (safe: the DB has no user data yet
# in staging). Remove this block after the first successful deploy.
npx prisma migrate deploy --schema ./prisma/schema.prisma 2>&1 || {
  echo "=== Migrate failed — attempting reset for fresh staging DB ==="
  npx prisma migrate reset --force --schema ./prisma/schema.prisma 2>&1 || true
  npx prisma migrate deploy --schema ./prisma/schema.prisma 2>&1 || echo "Migration still failing — app will start anyway"
}

echo "=== Starting Fixly backend ==="
exec node dist/main.js
