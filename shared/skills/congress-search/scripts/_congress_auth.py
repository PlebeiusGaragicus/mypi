#!/usr/bin/env python3
"""Load Congress.gov API key from the runtime environment."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ENV_KEY = "CONGRESS_GOV_API_KEY"
SIGNUP_URL = "https://api.congress.gov/sign-up/"


def _runtime_env_path() -> str:
    override = os.environ.get("MYPI_ENV_FILE", "").strip()
    if override:
        return str(Path(override).expanduser().resolve())
    return str(Path.home() / ".pi" / "mypi" / "mypi.env")


def fail_missing_api_key() -> None:
    config_path = _runtime_env_path()

    print("Error: Congress.gov API key not configured.", file=sys.stderr)
    print("", file=sys.stderr)
    print(f"Get a key: {SIGNUP_URL}", file=sys.stderr)
    print(f"Set {ENV_KEY} in {config_path} or run /mypi-env-config set {ENV_KEY} <key>", file=sys.stderr)
    print("", file=sys.stderr)
    print("In Pi: run /mypi-env-config for setup.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Agents: do not retry until the key is set.", file=sys.stderr)

    raise SystemExit(1)


def get_api_key() -> str:
    value = os.environ.get(ENV_KEY, "").strip()
    if value:
        return value
    fail_missing_api_key()
