#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install it from python.org, then try again."
  read -r _
  exit 1
fi
exec python3 start_audition.py
