The `todo` utility is a simple shell script for managing todo.jsonl task lists.

Design goals, non-goals, resolution, and safety: [docs/design/todo-cli.md](../../../docs/design/todo-cli.md) in this repo, or the published site [Todo CLI](https://PlebeiusGaragicus.github.io/dot-pi/design/todo-cli/).

## todo file

When `todo` runs, it looks for `todo.jsonl` in the current directory, then each parent directory up to the root. That file is the project or workspace todo list. If none exists, the active file is `~/.todo/todo.jsonl` (the directory is created if needed).

Run **`todo file`** in a project directory to create an empty `todo.jsonl` there; it prompts **`[y/N]`** before creating (default is no). Use **`todo file -y`** or **`todo file --yes`** to skip the prompt (required in non-interactive contexts). It refuses if `todo.jsonl` already exists in the current directory. Use **`todo which`** to print the absolute path of the active list after resolution.

## data format

Each line is one JSON object:

```json
{
    "id": 0,
    "text": "do the dishes",
    "done": false
}
```

`id` is a non-negative integer. New tasks get the next free id: max existing id plus one, starting from `0` when the file is empty.

## usage

```sh
todo                 # prints usage
todo list            # open tasks only: - [ ] (id) text
todo done            # finished tasks only: - [x] (id) text
todo all             # all tasks: - [ ] / - [x] markdown lines
todo file            # create ./todo.jsonl (prompts; -y / --yes skips)
todo which           # absolute path to active todo.jsonl
todo rm              # delete active todo.jsonl — same path as todo which (prompts; -y / --yes skips)
todo tidy            # remove all finished tasks from the list (prompts; -y / --yes skips)
todo new "foo"
todo edit <id>          # edit in VISUAL, EDITOR, or nano (default nano)
todo edit <id> "bar"    # inline, no editor
todo del <id>
todo finish <id>
todo unfinish <id>
todo help            # usage (-h and --help also work)
todo version
```

After a successful **`todo new`**, **`todo edit`**, **`todo finish`**, or **`todo unfinish`**, the script prints one line in the same markdown style as **`todo list`** / **`todo all`**: `- [ ] (id) text` or `- [x] (id) text`. **`todo del`** prints `Deleted: (id) text` instead.

## prerequisites

- `bash`
- `jq`
- `nano` (or another editor via `VISUAL` / `EDITOR`) for `todo edit <id>` without inline text

## install

**Recommended:** put dot-pi’s installed `core/bin` on your `PATH` (same as agent commands), then run `dotpi relink`. That creates `core/bin/todo` → `core/utilities/todo/todo` unless you have an agent config directory literally named `agents/todo` (that name reserves `core/bin/todo` for the dispatcher).

**Manual:** create `~/.local/bin` if needed, symlink this repo’s `todo` script there, and ensure that directory is on your `PATH`:

```sh
mkdir -p ~/.local/bin
ln -sf "$HOME/.dot-pi/core/utilities/todo/todo" "$HOME/.local/bin/todo"
```

If the repo is elsewhere, replace the path with the absolute path to `core/utilities/todo/todo` inside your checkout.

Check:

```sh
command -v todo && todo version
```
