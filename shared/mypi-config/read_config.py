#!/usr/bin/env python3
"""Read and ensure keys in ~/.pi/mypi.json (override: MYPI_CONFIG_FILE)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def resolve_config_path() -> Path:
    override = os.environ.get("MYPI_CONFIG_FILE", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return Path.home() / ".pi" / "mypi.json"


def read_config() -> dict[str, Any]:
    path = resolve_config_path()
    if not path.is_file():
        return {"tts": {}, "env": {}}
    try:
        raw = path.read_text(encoding="utf-8")
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return {"tts": {}, "env": {}}
        env = parsed.get("env")
        tts = parsed.get("tts")
        env_out: dict[str, str] = {}
        if isinstance(env, dict):
            for k, v in env.items():
                if isinstance(v, str):
                    env_out[str(k)] = v
        tts_out: dict[str, Any] = {}
        if isinstance(tts, dict):
            tts_out = dict(tts)
        return {"tts": tts_out, "env": env_out}
    except (OSError, json.JSONDecodeError):
        return {"tts": {}, "env": {}}


def write_config(config: dict[str, Any]) -> None:
    path = resolve_config_path()
    payload = {
        "tts": config.get("tts") or {},
        "env": config.get("env") or {},
    }
    body = json.dumps(payload, indent=2) + "\n"
    tmp = path.with_suffix(path.suffix + f".tmp.{os.getpid()}")
    tmp.write_text(body, encoding="utf-8")
    tmp.chmod(0o600)
    tmp.replace(path)
    try:
        path.chmod(0o600)
    except OSError:
        pass


def ensure_env_key(name: str, default: str = "") -> str:
    config = read_config()
    env = config.setdefault("env", {})
    if name in env:
        return env[name]
    env[name] = default
    write_config(config)
    return default


def ensure_tts_wpm(default: int = 300) -> int:
    config = read_config()
    tts = config.setdefault("tts", {})
    wpm = tts.get("wpm")
    if isinstance(wpm, (int, float)) and wpm > 0:
        return int(wpm)
    tts["wpm"] = default
    write_config(config)
    return default
