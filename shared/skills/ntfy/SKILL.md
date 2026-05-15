---
name: ntfy
description: Send push notifications via ntfy using scripts/ntfy-send.js (default topic bot). Override with --topic when the user names another topic.
disable-model-invocation: false
---

# ntfy notifications

Use when the user wants **push notifications** on phone or desktop via [ntfy](https://ntfy.sh/).

**Run `node scripts/ntfy-send.js` from this skill directory** with the message text. For a quick test, a single quoted string is enough. Configure ntfy with **`dotpi keys`** or **`/api-keys`** in pi if notifications fail with a configuration error on stderr.

## Default topic (`bot`)

Notifications use topic **`bot`** unless you pass **`--topic <name>`** (when the user asks for a different topic).

## Commands

```bash
node scripts/ntfy-send.js "Hello from the agent"
node scripts/ntfy-send.js "Deploy OK" --title "Production" --priority 5 --tags warning,deploy
node scripts/ntfy-send.js --topic alerts "Pager message"
echo "Build finished" | node scripts/ntfy-send.js
```

The message is all remaining arguments (or stdin when piped).

- **`--topic NAME`** — default **`bot`**
- **`--title TEXT`** — notification title
- **`--priority N`** — **1** (lowest) through **5** (highest)
- **`--tags LIST`** — comma-separated tags

If something goes wrong, the script prints a clear **`Error:`** line to stderr.
