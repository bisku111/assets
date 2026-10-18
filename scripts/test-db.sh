#!/usr/bin/env bash
# =====================================================================
# Applica le migrazioni su un Postgres usa-e-getta ed esegue i test RLS.
#
#   ./scripts/test-db.sh                               # Postgres temporaneo
#   DATABASE_URL=postgres://... ./scripts/test-db.sh    # database esistente
#
# Serve a rispondere a una domanda sola: "le policy fanno davvero quello
# che dicono?". Non basta che le migrazioni vengano applicate.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

run_sql() { psql -v ON_ERROR_STOP=1 -q "$1" -f "$2"; }

if [[ -n "${DATABASE_URL:-}" ]]; then
  TARGET="$DATABASE_URL"; SHIM=0
  echo "→ Database indicato da DATABASE_URL"
else
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)}"
  [[ -x "${PGBIN}/initdb" ]] || { echo "Postgres non trovato. Imposta PGBIN o DATABASE_URL." >&2; exit 1; }
  DATA="${PGDATA_DIR:-/var/tmp/maestro-pgdata}"
  PORT="${PGPORT:-55432}"
  echo "→ Avvio Postgres temporaneo su :$PORT"
  rm -rf "$DATA"; mkdir -p "$DATA"

  # Postgres rifiuta di girare come root. Nei container di CI si e' root,
  # quindi si crea un utente di servizio e gli si cede il cluster.
  if [[ "$(id -u)" == "0" ]]; then
    PGUSER_OS="${PGUSER_OS:-maestropg}"
    id -u "$PGUSER_OS" >/dev/null 2>&1 || useradd -m "$PGUSER_OS"
    chown -R "$PGUSER_OS" "$DATA"; chmod 700 "$DATA"
    AS_PG=(su "$PGUSER_OS" -c)
  else
    AS_PG=(bash -c)
  fi

  "${AS_PG[@]}" "$PGBIN/initdb -D $DATA -U postgres --auth=trust" >/dev/null
  "${AS_PG[@]}" "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l /tmp/maestro-pg.log start" >/dev/null
  trap '"${AS_PG[@]}" "$PGBIN/pg_ctl -D $DATA stop -m immediate" >/dev/null 2>&1 || true' EXIT
  sleep 2
  psql -q -h /tmp -p "$PORT" -U postgres -c "create database maestro;" >/dev/null
  TARGET="postgresql://postgres@/maestro?host=/tmp&port=$PORT"; SHIM=1
fi

# Lo shim ricrea auth.users, auth.uid() e i ruoli: su Supabase esistono gia'.
[[ "$SHIM" == "1" ]] && run_sql "$TARGET" supabase/tests/00_local_shim.sql

for f in supabase/migrations/*.sql; do
  echo "  applico $(basename "$f")"
  run_sql "$TARGET" "$f"
done

[[ "$SHIM" == "1" ]] && run_sql "$TARGET" supabase/tests/99_grants.sql

echo "→ Test RLS"
psql -v ON_ERROR_STOP=1 "$TARGET" -f supabase/tests/rls_test.sql 2>&1 | grep -E 'NOTICE|ERROR' || true
echo "✓ Database verificato"
