#!/usr/bin/env bash
# Prepends promoted skill script dirs to PATH (see scripts/path-promoted-skills.txt).
# From repo root:  source scripts/bootstrap.sh
# Pi loads extensions/preset/bootstrap.ts automatically; this file is for
# normal shells (e.g. dev outside pi).

set -euo pipefail

_mypi_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
_list="${_mypi_root}/scripts/path-promoted-skills.txt"

if [[ ! -f "$_list" ]]; then
	echo "bootstrap.sh: missing ${_list}" >&2
	exit 1
fi

_prefix=""
while IFS= read -r _line || [[ -n "${_line}" ]]; do
	_line="${_line#"${_line%%[![:space:]]*}"}"
	_line="${_line%"${_line##*[![:space:]]}"}"
	[[ -z "$_line" || "$_line" == \#* ]] && continue
	if [[ "$_line" == */* || "$_line" == *\\* || "$_line" == *..* ]]; then
		echo "bootstrap.sh: invalid skill name in path-promoted-skills.txt: ${_line}" >&2
		exit 1
	fi
	_abs="${_mypi_root}/shared/skills/${_line}/scripts"
	[[ -d "$_abs" ]] || continue
	_prefix="${_abs}${_prefix:+:${_prefix}}"
done < "$_list"

if [[ -n "$_prefix" ]]; then
	export PATH="${_prefix}${PATH:+:${PATH}}"
fi

_apply_env="${_mypi_root}/shared/runtime-env/apply-shell-env.mjs"
if [[ -f "$_apply_env" ]]; then
	# shellcheck disable=SC1090
	eval "$(node "$_apply_env")"
fi

unset _mypi_root _list _line _abs _prefix _apply_env
