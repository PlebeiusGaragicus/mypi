# Skill Builder

Skills are prompt-visible capability packages under `shared/skills/<name>/`. A preset exposes skills by listing their directories in `skillDirs`.

## Structure

Each skill should have:

```text
shared/skills/<name>/SKILL.md
shared/skills/<name>/scripts/...
```

`SKILL.md` is the prompt-facing contract. Scripts are implementation details unless the skill intentionally exposes a command by basename.

## Skill Documentation

`SKILL.md` should include:

- when to use the skill
- exact command names or invocation surface
- important safety boundaries
- expected outputs
- failure handling guidance when it affects agent behavior

Do not include secret setup instructions that duplicate script errors. Scripts that need runtime variables should fail clearly and name the missing variable.

## Path Promotion

Commands that should be callable by basename are listed in `scripts/path-promoted-skills.txt`. Pi sessions and `scripts/bootstrap.sh` both use that registry to prepend skill `scripts/` directories to `PATH`.

When a skill is path-promoted, say so in `SKILL.md` and tell agents to use the basename, not a path into the repo.

## Runtime Env

Skills may depend on `~/.pi/mypi/mypi.env`, provider auth stores, or ordinary shell environment. They must not store secrets in the skill directory or inject secret values into prompts.

## Review Checklist

- The description is short and helps the agent decide whether to load the skill.
- The body contains concrete usage instructions.
- Commands fail informatively before making network calls when required runtime values are missing.
- The skill avoids generated state, logs, caches, and credentials in the skill tree.
- Scripts use the root package's ESM convention or explicit extensions when needed.
