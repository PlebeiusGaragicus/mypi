---
name: ntfy
description: Send push notifications via ntfy using bare ntfy-send (default topic bot). Override with --topic when the user names another topic.
disable-model-invocation: false
---

# ntfy notifications

Use when the user wants **push notifications** on phone or desktop via [ntfy](https://ntfy.sh/).

This skill is **path-promoted**: in Pi agent sessions this skill’s `scripts/` directory is on your **PATH**. Run **`ntfy-send`** by basename with the message text. For a quick test, a single quoted string is enough. If notifications fail with a configuration error on stderr, ensure ntfy is configured via **`dotpi keys`** or **`/api-keys`** in pi.

## Default topic (`bot`)

Notifications use topic **`bot`** unless you pass **`--topic <name>`** (when the user asks for a different topic).

## Commands

```bash
ntfy-send "Hello from the agent"
ntfy-send "Deploy OK" --title "Production" --priority 5 --tags warning,deploy
ntfy-send --topic alerts "Pager message"
echo "Build finished" | ntfy-send
```

The message is all remaining arguments (or stdin when piped).

- **`--topic NAME`** — default **`bot`**
- **`--title TEXT`** — notification title
- **`--priority N`** — **1** (lowest) through **5** (highest)
- **`--tags LIST`** — comma-separated tags

If something goes wrong, the script prints a clear **`Error:`** line to stderr.
