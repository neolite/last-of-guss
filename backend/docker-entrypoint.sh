#!/bin/sh
set -e

echo "Applying database schema..."
npx drizzle-kit push

echo "Starting server..."
exec node dist/index.js
