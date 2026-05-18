# browser-runtime

Bun + Playwright persistent Chromium daemon for mypi **browser-control**. Agents invoke `$B <command>` (plain-text stdout).

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- Chromium for Playwright

## Setup

```bash
cd utilities/browser-runtime
bun install
bunx playwright install chromium
bun run build
```

From repo root:

```bash
bun run browser:install
bunx playwright install chromium
bun run browser:build
```

## Usage

```bash
export B="$(pwd)/utilities/browser-runtime/dist/browse"
# or: bun run browser:dev goto https://example.com

$B goto https://example.com
$B snapshot -i
$B status
```

State is stored in `<project>/.browser-control/browse.json`.

## Environment

| Variable | Description |
|----------|-------------|
| `BROWSE_STATE_FILE` | Override state file path |
| `BROWSER_CONTROL_STATE_DIR` | Override state directory (parent of `browse.json`) |
| `BROWSE_IDLE_TIMEOUT` | Idle shutdown ms (default 1800000) |
| `BROWSE_PORT` | Fixed server port (default random 10000–60000) |
| `BROWSE_PARENT_PID` | Set `0` to disable parent watchdog |

## Development

```bash
bun run dev goto https://example.com
bun test
```
