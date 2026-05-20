#!/usr/bin/env node
import assert from "node:assert/strict";
import {
	composePrompt,
	effectivePromptBase,
	effectiveTools,
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
    Custom
  append: |
    Tail
includeTools: [read]
`,
	"templated",
	"/pkg",
);

assert.equal(effectivePromptBase(templated), "templated");
assert.equal(composePrompt("Generated", templated), "Custom\n\nGenerated\n\nTail");

console.log("Preset runtime tests passed.");
