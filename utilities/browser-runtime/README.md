# browser-runtime

Bun + Playwright persistent Chromium daemon for mypi **browser-control**. Agents invoke `$B <command>` (plain-text stdout).

**Supported platforms:** macOS and Linux only.

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

$B goto https://example.com
$B snapshot -i
$B status
```

### Headed mode (user-visible browser)

```bash
$B connect          # visible Chromium; profile under .browser-control/chromium-profile/
$B handoff "msg"   # headless → headed mid-task
$B resume           # after user completes CAPTCHA / Cloudflare
$B disconnect       # shut down headed server
```

### Bot challenges

After `goto`, `text`, or `snapshot`, stdout may include `--- CHALLENGE_DETECTED: cloudflare ---`. Agents must handoff, notify the user, and `resume` before continuing.

## Environment

| Variable | Description |
|----------|-------------|
| `BROWSE_STATE_FILE` | Override state file path |
| `BROWSER_CONTROL_STATE_DIR` | Override state directory (parent of `browse.json`) |
| `BROWSE_HEADED` | `1` — server starts in headed mode (`connect` sets this) |
| `BROWSE_HEADED_PORT` | Fixed port for headed `connect` (default `34567`) |
| `BROWSE_IDLE_TIMEOUT` | Idle shutdown ms (default 1800000) |
| `BROWSE_PORT` | Fixed server port (default random 10000–60000) |
| `BROWSE_PARENT_PID` | Set `0` to disable parent watchdog (headed mode) |

## Development

```bash
bun run dev goto https://example.com
bun test
```
