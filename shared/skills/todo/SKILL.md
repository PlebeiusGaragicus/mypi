---
name: todo
description: Use bash for the `todo` utility for shred task lists management with the user.
disable-model-invocation: true
---

# Todo CLI

This skill is **path-promoted**: in Pi agent sessions this skill’s `scripts/` directory is on your **PATH**. Use the bare command **`todo`** (not a path into this skill folder).

`todo` is a simple cli utility used to manage shared todo lists with the user.  Todo lists are project-scoped `todo.jsonl` files not meant to be viewed or edited except via the `todo` utility.

Before using, always run bare `todo` to see the built-in usage:

```bash
todo
```

## Project-scoped todo lists

Work in the **intended project root** (the directory where the task list should live—usually the repo or workspace cwd). Run `todo which`. The active file is always that path.

Prefer **`./todo.jsonl` in the project root** for coding work so tasks do not silently attach to a parent repo or the global fallback file.

## Leave destructive actions to the user

Avoid destructive actions (eg. `todo del`, `todo rm`, `todo tidy`) unless explicitly instructed by the user. The user is expected to co-manage the list along with the agent. If cleanup is needed, **ask the user** or provide the suggestion to the user.

**`todo file`** is appropriate to run if the user has not yet started a project-level todo list and instructions don't clarify.  A system-wide `~/.todo/todo.jsonl` may also exist and is used by `todo` unless a project-level file is found.