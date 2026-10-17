#!/usr/bin/env bash
set -euo pipefail
# Build the review-only image explicitly before execution. Never forward user secrets.
if [ "$#" -ne 1 ]; then echo 'Usage: pdf-run.sh /path/to/private.pdf' >&2; exit 2; fi
input="$(realpath -- "$1")"
test -f "$input" || { echo 'PDF_INPUT_NOT_FILE' >&2; exit 2; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
docker run --rm --pull=never --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
 --pids-limit 32 --memory 256m --cpus 0.5 --user 65534:65534 --tmpfs /tmp:rw,nosuid,noexec,size=96m \
 --mount "type=bind,src=$input,dst=/quarantine/document.pdf,readonly" \
 --mount "type=bind,src=$root/packages/content,dst=/app/packages/content,readonly" \
 --mount "type=bind,src=$root/apps/worker/sandbox/pdf-entry.mjs,dst=/app/apps/worker/sandbox/pdf-entry.mjs,readonly" \
 ask-bill-pdf:ab-016 /quarantine/document.pdf
