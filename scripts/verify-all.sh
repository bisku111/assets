#!/usr/bin/env bash
# Verifica completa: tipi, test, database e app reale nel browser.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Typecheck"; npm run typecheck
echo "▸ Test unitari e dei componenti"; npm test
echo "▸ Migrazioni e Row Level Security"; ./scripts/test-db.sh
echo "▸ Build web"; npx expo export --platform web --output-dir dist >/dev/null
echo "▸ Prova end-to-end"; node scripts/smoke-web.mjs dist
echo "✓ Tutto verificato"
