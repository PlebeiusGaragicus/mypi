#!/usr/bin/env bash
# Curated PATH for skill scripts (mirrors extensions/agent-mode/bootstrap-path.ts).
# From repo root:  source scripts/bootstrap.sh
# Pi loads extensions/agent-mode/index.ts (which pulls in bootstrap-path) automatically; this file is for
# normal shells (e.g. dev outside pi).

set -euo pipefail

_mypi_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
export PATH="${_mypi_root}/shared/skills/todo/scripts${PATH:+:${PATH}}"

unset _mypi_root
