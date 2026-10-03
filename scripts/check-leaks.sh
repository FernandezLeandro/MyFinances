#!/bin/sh
# Busca emails, uuid, JWT y códigos de invitación en lo versionado y en lo nuevo sin commitear (deja
# afuera lo ignorado, como .env.local y CLAUDE.md). El repo es público: tiene que salir vacío.
# Las dos migraciones excluidas son historia ya aplicada.
cd "$(git rev-parse --show-toplevel)" || exit 2
if git grep -nIE --untracked '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|eyJ[A-Za-z0-9_-]{20,}|[A-Z]{3,}-[A-Z0-9]{6}\b' -- . \
  ':!package-lock.json' \
  ':!supabase/migrations/20260806210001_cleanup_test_assets.sql' \
  ':!supabase/migrations/20260807020001_promote_e2e_admin.sql' \
  | grep -v '@example\.com'; then
  echo "check-leaks: reemplazar lo de arriba por una descripción genérica" >&2
  exit 1
fi
