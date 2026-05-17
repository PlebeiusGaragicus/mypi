#!/usr/bin/env bash
# lmstudio-ctl — Control LM Studio via v1 REST API (LM Studio 0.4+), using Pi
# `~/.pi/agent/models.json` to pick an openai-completions provider (you choose
# which one is your LM Studio instance). Does not use legacy v0 API.
#
# Env:
#   PI_MODELS_JSON   Override path to models.json (default: ~/.pi/agent/models.json)
#
# Exit: 0 ok, 1 config/usage, 2 LM Studio / HTTP error

set -euo pipefail

MODELS_JSON="${PI_MODELS_JSON:-$HOME/.pi/agent/models.json}"
SCRIPT_NAME="${0##*/}"

die()  { echo "$SCRIPT_NAME: $*" >&2; exit 1; }
die2() { echo "$SCRIPT_NAME: $*" >&2; exit 2; }

for cmd in jq python3 curl; do
  command -v "$cmd" >/dev/null 2>&1 || die "required command not found: $cmd"
done

[ -f "$MODELS_JSON" ] || die "file not found: $MODELS_JSON (set PI_MODELS_JSON if needed)"

# Strip path from Pi baseUrl; LM Studio v1 control plane is on the same origin.
# Example: https://host:port/v1 -> https://host:port
origin_from_baseurl() {
  python3 -c '
import sys
from urllib.parse import urlparse, urlunparse
raw = (sys.argv[1] or "").strip()
p = urlparse(raw if "://" in raw else "http://" + raw)
if not p.netloc:
    print("Invalid baseUrl", file=sys.stderr)
    sys.exit(1)
o = urlunparse((p.scheme, p.netloc, "", "", "", ""))
print(o.rstrip("/"))
' "$1" 2>/dev/null || die "could not parse baseUrl: $1"
}

list_openai_provider_names() {
  jq -r '.providers // {} | to_entries[] | select(.value.api == "openai-completions") | .key' "$MODELS_JSON"
}

provider_baseurl() { jq -r --arg p "$1" '.providers[$p].baseUrl' "$MODELS_JSON"; }
provider_apikey() {
  # Literal key from JSON; empty or null = no Authorization header
  jq -r --arg p "$1" '(.providers[$p].apiKey // "") | if type == "string" then . else "" end' "$MODELS_JSON"
}

OPENAI_PROVIDERS=()
while IFS= read -r _line; do
  [ -n "$_line" ] && OPENAI_PROVIDERS+=("$_line")
done < <(list_openai_provider_names)

[ "${#OPENAI_PROVIDERS[@]}" -gt 0 ] || \
  die "no providers with api: \"openai-completions\" in $MODELS_JSON"

pick_provider() {
  local n i
  if [ "${#OPENAI_PROVIDERS[@]}" -eq 1 ]; then
    # shellcheck disable=SC2034
    SELECTED_PROVIDER="${OPENAI_PROVIDERS[0]}"
    echo "Using provider: $SELECTED_PROVIDER (only openai-completions entry)"
    return
  fi
  echo "openai-completions providers (select which is your LM Studio base):"
  i=1
  for p in "${OPENAI_PROVIDERS[@]}"; do
    local bu
    bu=$(provider_baseurl "$p" || true)
    echo "  $i) $p  (baseUrl: $bu)"
    i=$((i + 1))
  done
  while :; do
    printf "Enter 1–%d: " "$((i - 1))"
    read -r n
    if [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -lt "$i" ]; then
      SELECTED_PROVIDER="${OPENAI_PROVIDERS[$((n - 1))]}"
      return
    fi
    echo "Invalid choice."
  done
}

# curl GET /api/v1/models — prints body on success; non-200 -> die2
v1_get_models() {
  local origin="$1" key="$2" tmp code
  tmp=$(mktemp)
  if [ -n "$key" ]; then
    code=$(
      curl -sS -o "$tmp" -w '%{http_code}' \
        -H "Authorization: Bearer ${key}" \
        "$origin/api/v1/models" || true
    )
  else
    code=$(
      curl -sS -o "$tmp" -w '%{http_code}' \
        "$origin/api/v1/models" || true
    )
  fi
  if [ "$code" != 200 ]; then
    # shellcheck disable=SC2002
    head -c 400 <"$tmp" | cat -v >&2 || true
    echo >&2
    rm -f "$tmp"
    die2 "GET $origin/api/v1/models failed (HTTP $code). Ensure LM Studio 0.4+ and REST API; this script does not use v0."
  fi
  if ! jq -e '.models | type == "array"' "$tmp" >/dev/null 2>&1; then
    rm -f "$tmp"
    die2 "Unexpected JSON: .models is not an array. Is the origin actually LM Studio v1?"
  fi
  cat "$tmp"
  rm -f "$tmp"
}

v1_unload() {
  local origin="$1" key="$2" instance_id="$3" code tmp
  tmp=$(mktemp)
  if [ -n "$key" ]; then
    code=$(
      curl -sS -o "$tmp" -w '%{http_code}' \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${key}" \
        -d "$(jq -n --arg i "$instance_id" '{ instance_id: $i }')" \
        "$origin/api/v1/models/unload" || true
    )
  else
    code=$(
      curl -sS -o "$tmp" -w '%{http_code}' \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg i "$instance_id" '{ instance_id: $i }')" \
        "$origin/api/v1/models/unload" || true
    )
  fi
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    head -c 500 <"$tmp" | cat -v >&2 || true
    echo >&2
    rm -f "$tmp"
    die2 "POST .../models/unload failed (HTTP $code)"
  fi
  echo "Response ($code):"
  jq . "$tmp" 2>/dev/null || cat "$tmp"
  rm -f "$tmp"
}

v1_load() {
  local origin="$1" key="$2" model_key="$3" cl="$4" code tmp payload
  tmp=$(mktemp)
  if [ -n "$cl" ]; then
    payload=$(jq -n --arg m "$model_key" --argjson c "$cl" \
      '{ model: $m, context_length: $c }')
  else
    payload=$(jq -n --arg m "$model_key" '{ model: $m }')
  fi
  if [ -n "$key" ]; then
    code=$(
      curl -sS -o "$tmp" -w '%{http_code}' \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${key}" \
        -d "$payload" \
        "$origin/api/v1/models/load" || true
    )
  else
    code=$(
      curl -sS -o "$tmp" -w '%{http_code}' \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$origin/api/v1/models/load" || true
    )
  fi
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    head -c 500 <"$tmp" | cat -v >&2 || true
    echo >&2
    rm -f "$tmp"
    die2 "POST .../models/load failed (HTTP $code)"
  fi
  echo "Response ($code):"
  jq . "$tmp" 2>/dev/null || cat "$tmp"
  rm -f "$tmp"
}

print_model_table() {
  local json="$1" ty cnt k
  # Second column: instance count in memory (0 = none). Only `key` here — no display_name (too long, redundant).
  echo
  echo "Models (v1)"
  printf "  %-10s  %4s  %s\n" "type" "load" "key"
  echo "  ----------  ----  ------------------------------------------------"
  jq -r '.models[] |
    ((.loaded_instances // []) | length) as $lc |
    [ (.type // "?"), ($lc | tostring), .key ] | @tsv' <<<"$json" \
    | while IFS=$'\t' read -r ty cnt k; do
        printf "  %-10s  %4s  %s\n" "$ty" "$cnt" "$k"
      done
  echo
}

# Collect loaded instance_id values as tab-separated: instance_id, model key (for context)
list_loaded_instance_lines() {
  local json="$1"
  jq -r '.models[] | . as $m | $m.loaded_instances[]? | [ .id, $m.key ] | @tsv' <<<"$json"
}

action_unload() {
  local origin="$1" key="$2" json="$3"
  local -a lines=()
  local line i
  [ -n "$(list_loaded_instance_lines "$json" | head -1)" ] || { echo "No loaded model instances."; return; }
  i=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    i=$((i + 1))
    lines+=("$line")
    inst=${line%%$'\t'*}
    mk=${line#*$'\t'}
    echo "  $i)  instance_id=$inst   (model key: $mk)"
  done < <(list_loaded_instance_lines "$json")
  n="${#lines[@]}"
  printf "Unload which (1–%d), or 0 to cancel: " "$n"
  read -r c
  [[ "$c" =~ ^[0-9]+$ ]] || { echo "Cancelled."; return; }
  [ "$c" -eq 0 ] && { echo "Cancelled."; return; }
  [ "$c" -ge 1 ] && [ "$c" -le "$n" ] || { echo "Invalid."; return; }
  IFS=$'\t' read -r pick_inst _mkey <<<"${lines[$((c - 1))]}"
  v1_unload "$origin" "$key" "$pick_inst"
}

action_load() {
  local origin="$1" key="$2" json="$3"
  local mk cl
  printf "Model key to load (e.g. as shown in the list, often publisher/name): "
  read -r mk
  [ -n "$mk" ] || { echo "Empty; cancelled."; return; }
  printf "Optional context_length (press Enter to omit): "
  read -r cl
  if [ -z "$cl" ]; then
    v1_load "$origin" "$key" "$mk" ""
  else
    if ! [[ "$cl" =~ ^[0-9]+$ ]]; then
      echo "context_length must be a non-negative integer."
      return
    fi
    v1_load "$origin" "$key" "$mk" "$cl"
  fi
}

main() {
  pick_provider
  local p="$SELECTED_PROVIDER"
  local bu key origin models_json
  bu=$(provider_baseurl "$p")
  key=$(provider_apikey "$p")
  [ -n "$bu" ] && [ "$bu" != "null" ] || die "provider $p: missing baseUrl"
  origin=$(origin_from_baseurl "$bu")
  echo
  echo "Control URL (LM Studio v1): $origin/api/v1/…"
  echo
  models_json=$(v1_get_models "$origin" "$key")
  print_model_table "$models_json"

  while :; do
    echo "Provider: $p  |  origin: $origin"
    echo
    echo "  1) List / refresh model list and loaded state"
    echo "  2) Unload a loaded model instance"
    echo "  3) Load a model"
    echo "  4) Quit"
    printf "Choice [1-4]: "
    read -r a
    case "$a" in
      1) models_json=$(v1_get_models "$origin" "$key"); print_model_table "$models_json" ;;
      2) action_unload "$origin" "$key" "$models_json"; models_json=$(v1_get_models "$origin" "$key") ;;
      3) action_load "$origin" "$key" "$models_json"; models_json=$(v1_get_models "$origin" "$key") ;;
      4) echo "Bye."; exit 0 ;;
      *) echo "Invalid." ;;
    esac
  done
}

main "$@"
