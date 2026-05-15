#!/usr/bin/env python3

import argparse
import json
import sys
import textwrap
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


API_URL = "http://export.arxiv.org/api/query"
USER_AGENT = "pi-search-agent"
ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}
SORT_CHOICES = ("relevance", "submittedDate", "lastUpdatedDate")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search arXiv via the public Atom API.",
        epilog=(
            'Examples:\n'
            '  arxiv-search.py "retrieval augmented generation" --num 8\n'
            '  arxiv-search.py "ti:transformer AND cat:cs.CL" --sort relevance\n'
            '  arxiv-search.py "cat:cs.LG AND abs:diffusion" --sort submittedDate'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("query", nargs="+", help="arXiv search query, including field prefixes if useful")
    parser.add_argument("--num", type=parse_num, default=10, help="number of results (default: 10, max: 50)")
    parser.add_argument(
        "--sort",
        choices=SORT_CHOICES,
        default="relevance",
        help="sort order: relevance, submittedDate, or lastUpdatedDate (default: relevance)",
    )
    parser.add_argument("--json", action="store_true", help="print parsed results as JSON")
    return parser.parse_args()


def parse_num(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("--num must be an integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("--num must be at least 1")
    return min(parsed, 50)


def text_or_empty(element: ET.Element, path: str) -> str:
    found = element.find(path, ATOM_NS)
    return normalize_ws(found.text) if found is not None and found.text else ""


def normalize_ws(value: str) -> str:
    return " ".join(value.split())


def entry_id(entry: ET.Element) -> str:
    raw_id = text_or_empty(entry, "a:id")
    return raw_id.rstrip("/").rsplit("/", 1)[-1] if raw_id else ""


def parse_entry(entry: ET.Element) -> dict:
    authors = [
        normalize_ws(name.text)
        for author in entry.findall("a:author", ATOM_NS)
        for name in [author.find("a:name", ATOM_NS)]
        if name is not None and name.text
    ]
    categories = [
        category.attrib["term"]
        for category in entry.findall("a:category", ATOM_NS)
        if category.attrib.get("term")
    ]
    links = {
        link.attrib.get("title") or link.attrib.get("rel") or "link": link.attrib.get("href", "")
        for link in entry.findall("a:link", ATOM_NS)
        if link.attrib.get("href")
    }

    arxiv_id = entry_id(entry)
    return {
        "id": arxiv_id,
        "title": text_or_empty(entry, "a:title"),
        "published": text_or_empty(entry, "a:published")[:10],
        "updated": text_or_empty(entry, "a:updated")[:10],
        "authors": authors,
        "categories": categories,
        "summary": text_or_empty(entry, "a:summary"),
        "abs_url": links.get("alternate") or (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else ""),
        "pdf_url": links.get("pdf", ""),
    }


def fetch_results(query: str, num: int, sort: str) -> list[dict]:
    params = urllib.parse.urlencode(
        {
            "search_query": query,
            "start": 0,
            "max_results": num,
            "sortBy": sort,
            "sortOrder": "descending",
        }
    )
    request = urllib.request.Request(f"{API_URL}?{params}", headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"arXiv API request failed (HTTP {exc.code}): {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"arXiv API request failed: {exc.reason}") from exc

    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise RuntimeError(f"arXiv API returned malformed XML: {exc}") from exc

    return [parse_entry(entry) for entry in root.findall("a:entry", ATOM_NS)]


def author_line(authors: list[str]) -> str:
    if not authors:
        return "(no authors listed)"
    if len(authors) <= 3:
        return ", ".join(authors)
    return f"{', '.join(authors[:3])}, et al."


def print_readable(query: str, sort: str, results: list[dict]) -> None:
    if not results:
        print("No results found")
        return

    print(f"Found {len(results)} result(s) for: {query}")
    print(f"Sort: {sort}")
    print("")

    for index, result in enumerate(results, start=1):
        print(f"{index}. {result['title'] or '(untitled)'}")
        print(f"   arXiv: {result['id'] or '(unknown id)'}")
        if result["published"]:
            print(f"   Published: {result['published']}")
        if result["updated"] and result["updated"] != result["published"]:
            print(f"   Updated: {result['updated']}")
        print(f"   Authors: {author_line(result['authors'])}")
        if result["categories"]:
            print(f"   Categories: {', '.join(result['categories'][:6])}")
        if result["abs_url"]:
            print(f"   URL: {result['abs_url']}")
        if result["summary"]:
            print("   Summary:")
            wrapped = textwrap.wrap(result["summary"], width=92)
            for line in wrapped:
                print(f"   {line}")
        print("")

    print("Tip: Use arxiv-fetch.py with a promising arXiv id when you need full paper text.")


def main() -> int:
    args = parse_args()
    query = " ".join(args.query).strip()
    if not query:
        print("Error: no query provided", file=sys.stderr)
        return 1

    try:
        results = fetch_results(query, args.num, args.sort)
        if args.json:
            print(json.dumps({"query": query, "sort": args.sort, "results": results}, indent=2))
        else:
            print_readable(query, args.sort, results)
        return 0
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
