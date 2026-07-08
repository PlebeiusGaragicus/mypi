#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	composePrompt,
	effectivePromptBase,
	effectiveTools,
	loadPresetSource,
	mergePreset,
	parsePresetYaml,
	presetRequiresCleanSession,
} from "../shared/presets/runtime.mjs";

const base = parsePresetYaml(
	`
description: Base
userSelectable: true
thinkingLevel: low
prompt:
  base: pi
  append: |
    Base append
includeTools:
  - read
extensions:
  - questionnaire
skillDirs:
  - shared/skills/todo
workers:
  - scout
environment:
  TAVILY_API_KEY: base
`,
	"demo",
	"/pkg",
);

const overlay = parsePresetYaml(
	`
description: Overlay
thinkingLevel: high
prompt:
  system: |
    Overlay system
includeTools:
  - bash
extensions:
  - workflow-orchestrator
environment:
  TAVILY_API_KEY: ""
  EXA_API_KEY: overlay
`,
	"demo",
	"/project",
);

const merged = mergePreset(base, overlay);
assert.equal(merged.description, "Overlay");
assert.equal(merged.thinkingLevel, "high");
assert.deepEqual(merged.includeTools, ["read", "bash"]);
assert.deepEqual(merged.extensions, ["questionnaire", "workflow-orchestrator"]);
assert.deepEqual(merged.workers, ["scout"]);
assert.equal(merged.environment.TAVILY_API_KEY, "");
assert.equal(merged.environment.EXA_API_KEY, "overlay");
assert.equal(merged.prompt.base, "pi");
assert.equal(merged.prompt.system, "Overlay system");
assert.equal(effectivePromptBase(merged), "pi");
assert.deepEqual(effectiveTools(merged), ["read", "bash", "questionnaire", "subagent"]);
assert.equal(presetRequiresCleanSession(merged), true);

const conversationalDelegator = parsePresetYaml(
	`
description: Conversational preset with workers
cleanSession: false
extensions:
  - workflow-orchestrator
workers:
  - web
`,
	"delegator",
	"/pkg",
);

assert.equal(conversationalDelegator.cleanSession, false);
assert.equal(presetRequiresCleanSession(conversationalDelegator), false);
assert.equal(presetRequiresCleanSession(mergePreset(base, conversationalDelegator)), false);

const raw = parsePresetYaml(
	`
description: Raw
prompt:
  base: raw
  system: |
    Only this.
tools: none
`,
	"raw",
	"/pkg",
);

assert.equal(composePrompt("Generated", raw), "Only this.");
assert.deepEqual(effectiveTools(raw), []);

const templated = parsePresetYaml(
	`
description: Templated
prompt:
  system: |
    Templated system.
  append: |
    Tail.
includeTools: [read]
`,
	"templated",
	"/pkg",
);

const generatedPrompt = `You are an expert coding assistant operating inside pi, a coding agent harness.

Available tools:
- read: Read files
- bash: Run shell commands

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Be concise

# Project Context

Project-specific instructions and guidelines:

## AGENTS.md

Project rules.

The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.

<available_skills>
  <skill>
    <name>demo-skill</name>
    <description>Demo skill.</description>
    <location>/pkg/shared/skills/demo-skill/SKILL.md</location>
  </skill>
</available_skills>
Current date: 2026-05-20
Current working directory: /pkg`;

const templatedPrompt = composePrompt(generatedPrompt, templated);
assert.equal(effectivePromptBase(templated), "templated");
assert.equal(
	templatedPrompt,
	`Templated system.

Available tools:
- read: Read files
- bash: Run shell commands

# Project Context

Project-specific instructions and guidelines:

## AGENTS.md

Project rules.

The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.

<available_skills>
  <skill>
    <name>demo-skill</name>
    <description>Demo skill.</description>
    <location>/pkg/shared/skills/demo-skill/SKILL.md</location>
  </skill>
</available_skills>

Current date: 2026-05-20
Current working directory: /pkg

Tail.`,
);
assert.equal(templatedPrompt.includes("You are an expert coding assistant"), false);
assert.equal(templatedPrompt.includes("Guidelines:"), false);
assert.equal(templatedPrompt.includes("In addition to the tools above"), false);

const registry = loadPresetSource(new URL("..", import.meta.url).pathname);
for (const [name, preset] of registry) {
	if (preset.prompt?.base === "pi" && preset.prompt?.append?.trim()) {
		assert.equal(name, "code", `${name}.yml must not append to the default Pi prompt`);
	}
}
assert.equal(registry.get("chat")?.prompt?.base, "raw");
assert.equal(registry.get("web")?.prompt?.base, "templated");
assert.equal(registry.get("write")?.prompt?.base, "templated");
assert.equal(registry.get("scout")?.prompt?.base, "templated");

console.log("Preset runtime tests passed.");
