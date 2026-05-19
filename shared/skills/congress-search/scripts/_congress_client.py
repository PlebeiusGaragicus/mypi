#!/usr/bin/env python3
"""Shared Congress.gov API v3 HTTP helpers."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any

from _congress_auth import get_api_key

BASE_URL = "https://api.congress.gov/v3/"
USER_AGENT = "mypi-congress-search"
PAGE_SLEEP_SEC = 0.2

BILL_TYPE_SLUG = {
    "hr": "house-bill",
    "s": "senate-bill",
    "hjres": "house-joint-resolution",
    "sjres": "senate-joint-resolution",
    "hconres": "house-concurrent-resolution",
    "sconres": "senate-concurrent-resolution",
    "hres": "house-resolution",
    "sres": "senate-resolution",
}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if text:
            self._parts.append(text)

    def text(self) -> str:
        return " ".join(self._parts)


def strip_html(value: str) -> str:
    if not value or "<" not in value:
        return value.strip()
    parser = _TextExtractor()
    parser.feed(value)
    return parser.text()


def normalize_path(path: str) -> str:
    return path.strip().lstrip("/")


def ordinal_congress(congress: int | str) -> str:
    n = int(congress)
    if 10 <= n % 100 <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def format_bill_citation(congress: int | str, bill_type: str, number: int | str) -> str:
    return f"{congress} {bill_type.upper()} {number}"


def congress_gov_bill_url(congress: int | str, bill_type: str, number: int | str) -> str:
    slug = BILL_TYPE_SLUG.get(bill_type.lower(), bill_type.lower())
    return (
        f"https://www.congress.gov/bill/{ordinal_congress(congress)}-congress/"
        f"{slug}/{number}"
    )


def format_datetime_param(value: str) -> str:
    """Accept YYYY-MM-DD or full ISO; return API-friendly timestamp."""
    value = value.strip()
    if "T" in value:
        return value if value.endswith("Z") else f"{value}Z"
    return f"{value}T00:00:00Z"


def parse_bill_ref(
    *parts: str,
) -> tuple[int, str, int]:
    """Parse 118 hr 3076, 118-HR-3076, or hr3076 with congress flag elsewhere."""
    if len(parts) == 1:
        raw = parts[0].strip()
        m = re.match(r"^(\d+)[\s\-_/]*(hr|s|hjres|sjres|hconres|sconres|hres|sres)[\s\-_/]*(\d+)$", raw, re.I)
        if m:
            return int(m.group(1)), m.group(2).lower(), int(m.group(3))
        m = re.match(r"^(hr|s|hjres|sjres|hconres|sconres|hres|sres)(\d+)$", raw, re.I)
        if m:
            raise ValueError("bill number without congress; pass congress separately")
        raise ValueError(f"could not parse bill reference: {raw}")

    if len(parts) == 3:
        return int(parts[0]), parts[1].lower(), int(parts[2])

    raise ValueError("expected bill as: CONGRESS TYPE NUMBER")


def api_request(
    path: str,
    *,
    query: dict[str, str | int] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    path = normalize_path(path)
    params: dict[str, str] = {"format": "json"}
    if query:
        for key, val in query.items():
            if val is not None and val != "":
                params[key] = str(val)

    url = urllib.parse.urljoin(BASE_URL, path)
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "x-api-key": get_api_key(),
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"Congress.gov API request failed (HTTP {exc.code}): {detail or exc.reason}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Congress.gov API request failed: {exc.reason}") from exc

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Congress.gov API returned invalid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise RuntimeError("Congress.gov API returned unexpected response shape")
    return data


def api_request_url(url: str, *, timeout: int = 60) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "x-api-key": get_api_key(),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"Congress.gov API request failed (HTTP {exc.code}): {detail or exc.reason}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Congress.gov API request failed: {exc.reason}") from exc

    data = json.loads(body)
    if not isinstance(data, dict):
        raise RuntimeError("Congress.gov API returned unexpected response shape")
    return data


def fetch_pages(
    path: str,
    *,
    query: dict[str, str | int] | None = None,
    max_pages: int = 1,
    list_key: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch one or more pages; return combined list items from plural data key."""
    items: list[dict[str, Any]] = []
    data = api_request(path, query=query)
    pages = 0

    while True:
        pages += 1
        key = list_key or _detect_list_key(data)
        chunk = data.get(key, [])
        if isinstance(chunk, list):
            items.extend(x for x in chunk if isinstance(x, dict))

        pagination = data.get("pagination")
        next_url = pagination.get("next") if isinstance(pagination, dict) else None
        if not next_url or pages >= max_pages:
            break
        time.sleep(PAGE_SLEEP_SEC)
        data = api_request_url(next_url)

    return items


def _detect_list_key(data: dict[str, Any]) -> str:
    skip = {"request", "pagination"}
    for key, val in data.items():
        if key in skip:
            continue
        if isinstance(val, list):
            return key
    return "results"


def resolve_congress(congress: int | None) -> int:
    if congress is not None:
        return congress
    data = api_request("congress/current")
    current = data.get("congress")
    if isinstance(current, list) and current:
        first = current[0]
        if isinstance(first, dict) and first.get("number") is not None:
            return int(first["number"])
    if isinstance(current, dict) and current.get("number") is not None:
        return int(current["number"])
    raise RuntimeError("could not determine current congress from API")


def latest_action_text(item: dict[str, Any]) -> str:
    action = item.get("latestAction")
    if isinstance(action, dict):
        return str(action.get("text") or "").strip()
    return ""


def latest_action_date(item: dict[str, Any]) -> str:
    action = item.get("latestAction")
    if isinstance(action, dict):
        return str(action.get("actionDate") or "").strip()
    return ""


def matches_keyword(item: dict[str, Any], keyword: str, *fields: str) -> bool:
    if not keyword:
        return True
    needle = keyword.lower()
    for field in fields:
        val = item.get(field)
        if isinstance(val, str) and needle in val.lower():
            return True
    return False
