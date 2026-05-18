---
name: browser-control
description: Use for web browsing, UI interaction, screenshots, scraping, and repeatable browser skills. Read skill before using browser.
disable-model-invocation: false
---

# Browser Control

**`browser-control` is the product name for this CLI, not a command on `PATH`.** Invoke it only as **`$B <subcommand> …`**.

Use **`$B`** to drive a persistent Playwright Chromium daemon. The first command starts the daemon; later commands reuse the same browser state through `.browser-control/browse.json`. State is workspace-local when launched inside a dot-pi workspace, and project-local for normal in-situ browsing.

## Setup

**`$B`** is initialized by dot-pi dispatch before Pi starts. Browser-control calculates its state directory automatically from `BROWSER_CONTROL_STATE_DIR`, `WORKSPACE_DIR`, the current dot-pi workspace path, or the current project root. Use **`$B …`** directly in bash.

If **`$B`** is missing or empty, the agent was likely not launched through dot-pi dispatch. For manual debugging, set `B` to the browser-control binary path or invoke the binary directly.

## Core Workflow

```bash
$B goto https://example.com
$B snapshot -i
$B click @e1
$B fill @e2 "search text"
$B press Enter
$B text
$B screenshot
```

Run **`snapshot -i`** before clicking or filling. Re-run it after navigation, popovers, form submissions, or any UI change because refs can go stale.

## Choosing Reading Commands

Use **`snapshot -i`** when you need clickable/fillable **`@e`** refs or need to inspect page structure. For extraction tasks such as headlines, page summaries, or lists, prefer **`links`**, **`text`**, or **`html <selector>`** when reasonable. If **`snapshot -i`** already contains the headlines or list you need, answer from it before chaining more tools. Use **`skill run <name>`** when a packaged browser skill clearly matches the task.

## Commands

```text
Navigation:  goto <url>, url
Reading:     text [css], html [css], links, snapshot [-i]
Actions:     click <@e|css>, fill <@e|css> <text>, press <key>, scroll [@e|css]
Visual:      screenshot [path]
Tabs:        tabs, newtab [url], closetab [id]
Skills:      skill list, skill show <name>, skill run <name>, skill test <name>
Lifecycle:   status, stop, restart
```

## Browser Skills

Browser skills are deterministic scripts discovered from:

1. `<project>/.browser-control/browser-skills/`
2. `$DOT_PI_OVERLAY/browser-skills/`
3. `$DOT_PI_DIR/core/utilities/browser-runtime/browser-skills/`

Use a skill when it clearly matches the task:

```bash
$B skill list
$B skill show hackernews-frontpage
$B skill run hackernews-frontpage
```

## Safety

Ask before mutating user accounts or external systems: submitting forms, posting, purchasing, deleting, or changing settings. Reading public pages, screenshots, and local extraction are fine.
