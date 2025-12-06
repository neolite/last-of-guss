#!/bin/sh
set -e

echo "Applying database schema..."
npx drizzle-kit push

echo "Starting server..."
exec npx tsx src/index.ts
