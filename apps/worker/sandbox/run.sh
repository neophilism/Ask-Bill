#!/usr/bin/env bash
set -euo pipefail
# Pre-pulled image only. Source stays quarantined; no host secrets or network.
if [ "$#" -ne 2 ]; then echo 'Usage: run.sh /path/to/input allowed-mime' >&2; exit 2; fi
file="$1"; mime="$2"
case "$mime" in
 text/plain|text/markdown|text/xml|application/xml|application/pdf|application/vnd.openxmlformats-officedocument.wordprocessingml.document) ;;
 *) echo 'INTAKE_MIME' >&2; exit 2;;
esac
test -f "$file" || { echo 'INPUT_NOT_FILE' >&2; exit 2; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
file="$(realpath -- "$file")"
docker run --rm --pull=never --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
 --pids-limit 32 --memory 256m --cpus 0.5 --user 65534:65534 --tmpfs /tmp:rw,nosuid,noexec,size=8m \
 --env "ASK_BILL_INPUT_MIME=$mime" \
 --mount "type=bind,src=$file,dst=/quarantine/input,readonly" \
 --mount "type=bind,src=$root/packages/content/intake,dst=/app/packages/content/intake,readonly" \
 --mount "type=bind,src=$root/apps/worker/sandbox/entry.mjs,dst=/app/apps/worker/sandbox/entry.mjs,readonly" \
 --workdir /app node:24.19.0-alpine node apps/worker/sandbox/entry.mjs /quarantine/input
