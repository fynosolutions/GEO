#!/usr/bin/env bash
set -euo pipefail
umask 077
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
env_file="${AUDIT_ENV_FILE:-$task_dir/.env}"
env_file="$(realpath -- "$env_file")"
if [[ -n "${AUDIT_EXISTING_DATABASE_URL:-}" ]] || grep -Eq '^[[:space:]]*(export[[:space:]]+)?AUDIT_EXISTING_DATABASE_URL[[:space:]]*=' "$env_file"; then
    printf 'Shared existing databases require the existing backup procedure, pausing ALL old and new writers. This script only handles the standalone PostgreSQL container.\n' >&2
    exit 2
fi
export AUDIT_ENV_FILE="$env_file"
compose=(docker compose --env-file "$env_file" -f "$task_dir/compose.yaml")
backup_dir="$task_dir/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -- "$task_dir/backups"
mkdir -- "$backup_dir"
writers=()
while IFS= read -r service; do
    case "$service" in web|audit-worker) writers+=("$service");; esac
done < <("${compose[@]}" ps --services --status running)
resume_writers() {
    if ((${#writers[@]})); then "${compose[@]}" start "${writers[@]}"; fi
}
trap resume_writers EXIT
if ((${#writers[@]})); then "${compose[@]}" stop "${writers[@]}"; fi
"${compose[@]}" exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$backup_dir/database.dump"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_dir/database.dump" > /dev/null
"${compose[@]}" run --rm --no-deps --entrypoint tar artifact-reader -czf - -C /var/lib/elmo-audits . > "$backup_dir/artifacts.tar.gz"
(
    cd -- "$backup_dir"
    sha256sum database.dump artifacts.tar.gz > SHA256SUMS
)
printf 'created_at_utc=%s\n' "$(date -u +%FT%TZ)" > "$backup_dir/manifest.txt"
printf 'Verified backup saved to %s\n' "$backup_dir"
