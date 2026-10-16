#!/usr/bin/env bash
set -euo pipefail
umask 077
task_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -ne 1 ]]; then printf 'Usage: bash restore-drill.sh /absolute/path/to/backup\n' >&2; exit 2; fi
backup_dir="$(realpath -- "$1")"
if [[ ! -f "$backup_dir/SHA256SUMS" || ! -f "$backup_dir/database.dump" || ! -f "$backup_dir/artifacts.tar.gz" ]]; then
    printf 'A complete backup and checksum manifest are required\n' >&2; exit 2
fi
(
    cd -- "$backup_dir"
    sha256sum --check SHA256SUMS
)
env_file="$(realpath -- "${AUDIT_ENV_FILE:-$task_dir/.env}")"
export AUDIT_ENV_FILE="$env_file"
compose=(docker compose --env-file "$env_file" -f "$task_dir/compose.yaml")
drill_suffix="$(date -u +%Y%m%d%H%M%S)_audit_restore_drill"
# Always create a fresh database. Never clean, drop or overwrite the live one.
"${compose[@]}" exec -T postgres sh -c 'exec createdb -U "$POSTGRES_USER" "$1"' sh "$drill_suffix"
"${compose[@]}" exec -T postgres sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --exit-on-error' sh "$drill_suffix" < "$backup_dir/database.dump"
"${compose[@]}" exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -c "select (select count(*) from audits) as audits,(select count(*) from audit_reports) as reports,(select count(*) from audit_cost_reservations) as reservations"' sh "$drill_suffix"
# The drill volume is separate from the production artifact volume. Refuse to
# overwrite files from a prior drill; use a new Compose project for another run.
"${compose[@]}" run --rm --no-deps --entrypoint tar artifact-drill -xzf - --no-same-owner --keep-old-files -C /var/lib/elmo-audit-drill < "$backup_dir/artifacts.tar.gz"
printf 'Restored isolated database %s and audit-drill volume. Live services and budget were not changed.\n' "$drill_suffix"
