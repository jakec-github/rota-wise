#!/bin/bash
#
# Regenerates every screenshot on the splash page (site/static/shots/*.webp).
# The browser half is web/shoot-splash.ts.
#
# Usage: scripts/shoot-splash.sh
#
# The shots are of the dev stack, seeded through its API with the synthetic dev
# roster. Every checkout's dev stack shares one database, so this one runs on
# a database of its own: it points the dev config at it just long enough for
# the server to read it, puts the config back, and drops the database at the
# end (dev-stack.sh creates it). A stack already running is stopped first and not restarted.
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .worktree.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .worktree.env
    set +a
fi

CONFIG=env/dev/drop_in_config.yaml
DB=ilford_splash_shots
PORT="${API_PORT:-8080}"
SHOTS=site/static/shots
TMP="$(mktemp -d)"
BACKUP="$TMP/drop_in_config.yaml"

for tool in cwebp bun docker; do
    command -v "$tool" >/dev/null || { echo "shoot-splash: needs $tool on the PATH" >&2; exit 1; }
done

cp "$CONFIG" "$BACKUP"
cleanup() {
    cp "$BACKUP" "$CONFIG"
    scripts/dev-stack.sh stop >/dev/null 2>&1 || true
    scripts/test-db.sh drop "$DB" >/dev/null 2>&1 || true
    rm -rf "$TMP"
}
trap cleanup EXIT

scripts/dev-stack.sh stop >/dev/null 2>&1 || true
scripts/test-db.sh drop "$DB" >/dev/null 2>&1 || true

# The server reads its config once, at start, so the config is back as it was
# the moment the stack is up.
# The Organisation is renamed too: a shot reads better with a plausible name
# than with "Dev Organisation", and the name is as made up as the roster.
sed -i.bak -e "s#/ilford_dropin_dev?#/${DB}?#" -e "s#displayName: 'Dev Organisation'#displayName: 'Riverside Pantry'#" "$CONFIG" && rm -f "$CONFIG.bak"
grep -q "/${DB}?" "$CONFIG" || { echo "shoot-splash: could not point $CONFIG at $DB" >&2; exit 1; }
scripts/dev-stack.sh start
cp "$BACKUP" "$CONFIG"

(cd web && bun shoot-splash.ts "http://localhost:${PORT}" "$TMP")

mkdir -p "$SHOTS"
for png in "$TMP"/*.png; do
    name="$(basename "$png" .png)"
    cwebp -quiet -q 82 "$png" -o "$SHOTS/$name.webp"
    echo "wrote $SHOTS/$name.webp"
done
