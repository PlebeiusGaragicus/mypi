#!/usr/bin/env python3
"""Load Congress.gov API key from env or ~/.pi/mypi.json."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ENV_KEY = "CONGRESS_GOV_API_KEY"
SIGNUP_URL = "https://api.congress.gov/sign-up/"


def _mypi_config_imports():
    shared_root = Path(__file__).resolve().parents[3]
    mypi_config = shared_root / "mypi-config"
    if str(mypi_config) not in sys.path:
        sys.path.insert(0, str(mypi_config))
    from read_config import read_config, resolve_config_path  # noqa: PLC0415

    return read_config, resolve_config_path


def _read_key_from_file() -> str:
    read_config, _ = _mypi_config_imports()
    config = read_config()
    env = config.get("env")
    if isinstance(env, dict):
        value = env.get(ENV_KEY)
        if isinstance(value, str):
            return value.strip()
    return ""


def _notify_missing_key(config_path: str) -> None:
    ntfy = shutil.which("ntfy-send")
    if not ntfy:
        return
    message = (
        "Congress.gov API: set CONGRESS_GOV_API_KEY in "
        f"{config_path} (get key: {SIGNUP_URL}). Run /mypi-config in Pi."
    )
    try:
        subprocess.run(
            [ntfy, message],
            capture_output=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def fail_missing_api_key() -> None:
    _, resolve_config_path = _mypi_config_imports()
    config_path = str(resolve_config_path())

    print("Error: Congress.gov API key not configured.", file=sys.stderr)
    print("", file=sys.stderr)
    print(f"Get a key: {SIGNUP_URL}", file=sys.stderr)
    print(f"Set env.{ENV_KEY} in {config_path}", file=sys.stderr)
    print("", file=sys.stderr)
    print("In Pi: run /mypi-config for setup instructions.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Agents: do not retry until the key is set.", file=sys.stderr)

    _notify_missing_key(config_path)
    raise SystemExit(1)


def get_api_key() -> str:
    value = os.environ.get(ENV_KEY, "").strip()
    if value:
        return value
    value = _read_key_from_file()
    if value:
        return value
    fail_missing_api_key()
