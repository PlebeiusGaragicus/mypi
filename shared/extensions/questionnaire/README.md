# Questionnaire Extension

Registers a `questionnaire` tool that lets the agent ask the user one or more multiple-choice questions interactively. Single questions render as a simple option list; multiple questions render as a tab bar with a final Submit tab.

## Files

- `index.ts` -- Tool definition, parameter schema, custom TUI renderer

## Tool: `questionnaire`

**Parameters:**

```ts
{
  questions: Array<{
    id: string;          // unique identifier for this question
    label?: string;      // short tab-bar label (defaults to "Q1", "Q2", ...)
    prompt: string;      // full question text shown to the user
    options: Array<{
      value: string;       // value returned when selected
      label: string;       // option display label
      description?: string;// optional sub-line shown below label
    }>;
  }>;
}
```

**Returns** an `AgentToolResult` whose `details` is:

```ts
{
  questions: Question[];
  answers: Array<{
    id: string;
    value: string;
    label: string;
    wasCustom: boolean;   // true if entered via "Type your own response"
    index?: number;       // option index, when chosen from the list
  }>;
  cancelled: boolean;
}
```

If the agent runs without a UI (`!ctx.hasUI`) or with an empty `questions` array, the tool returns an error result with `cancelled: true` and no answers.

## Behavior

- Single question: arrow keys to choose, Enter to submit.
- Multi question: the tab bar at the top shows each question's `label` plus a final Submit tab. Answering advances to the next tab; the Submit tab finalizes.
- Every question always includes a built-in "Type your own response" option that switches into an inline `Editor` for free-text input. This is enforced by the tool and cannot be disabled by the agent.
- The result is cached per tab via `refresh()`; tab navigation does not re-prompt.
- When the prompt opens, a terminal bell (`\x07`) is written to stdout (TTY only) so the user is alerted that input is needed. This mirrors the bell used by the [`plan`](../plan/README.md) extension on `plan_submit`.

## Usage by Other Extensions

The [`plan-mode`](../plan-mode/README.md) extension whitelists `questionnaire` as one of the read-only tools available during planning so the agent can ask clarifying questions before submitting a plan.

## Hooks Registered

None -- this is a pure tool extension.

## Related Docs

- [Writing Extensions](https://PlebeiusGaragicus.github.io/dot-pi/reference/extensions/)
