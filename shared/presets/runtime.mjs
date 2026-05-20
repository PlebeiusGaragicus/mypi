import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export const EXTENSION_TOOL_NAMES = {
	"workflow-orchestrator": ["subagent"],
	questionnaire: ["questionnaire"],
};

export const BUILTIN_TOOL_NAMES = new Set(["ls", "find", "grep", "read", "write", "edit", "bash"]);
export const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
export const PROMPT_BASES = new Set(["pi", "templated", "raw"]);

export function emptyPreset(name, sourceRoot) {
	return {
		name,
		sourceRoot,
		includeTools: [],
		extensions: [],
		skillDirs: [],
		promptFiles: [],
		promptDirs: [],
		workers: [],
	};
}

export function unique(items) {
	return [...new Set(items.filter(Boolean))];
}

function stripQuotes(value) {
	const trimmed = String(value ?? "").trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function parseBoolean(value) {
	const normalized = stripQuotes(value).toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return undefined;
}

function parseInlineList(value) {
	const trimmed = value.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
	return trimmed
		.slice(1, -1)
		.split(",")
		.map((item) => stripQuotes(item).trim())
		.filter(Boolean);
}

function countIndent(line) {
	return line.match(/^ */)?.[0].length ?? 0;
}

function readBlock(lines, start, parentIndent) {
	const out = [];
	let minIndent = null;
	let i = start;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() && countIndent(line) <= parentIndent) break;
		if (line.trim()) {
			const indent = countIndent(line);
			minIndent = minIndent === null ? indent : Math.min(minIndent, indent);
		}
		out.push(line);
	}
	const trimBy = minIndent ?? parentIndent + 2;
	return {
		value: out.map((line) => (line.length >= trimBy ? line.slice(trimBy) : line.trimEnd())).join("\n").trim(),
		next: i,
	};
}

function readArray(lines, start, parentIndent) {
	const out = [];
	let i = start;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) continue;
		if (countIndent(line) <= parentIndent) break;
		const trimmed = line.trim();
		if (!trimmed.startsWith("- ")) break;
		out.push(stripQuotes(trimmed.slice(2)));
	}
	return { value: out, next: i };
}

function readNestedMap(lines, start, parentIndent) {
	const out = {};
	let i = start;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) continue;
		const indent = countIndent(line);
		if (indent <= parentIndent) break;
		const trimmed = line.trim();
		const colon = trimmed.indexOf(":");
		if (colon <= 0) continue;
		const key = trimmed.slice(0, colon).trim();
		const raw = trimmed.slice(colon + 1).trim();
		if (raw === "|" || raw === ">") {
			const block = readBlock(lines, i + 1, indent);
			out[key] = block.value;
			i = block.next - 1;
		} else {
			out[key] = stripQuotes(raw);
		}
	}
	return { value: out, next: i };
}

export function parsePresetYaml(raw, name, sourceRoot) {
	const preset = emptyPreset(name, sourceRoot);
	const lines = raw.split(/\r?\n/);
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.trim() || line.trim().startsWith("#")) {
			i++;
			continue;
		}
		const indent = countIndent(line);
		if (indent !== 0) {
			i++;
			continue;
		}
		const colon = line.indexOf(":");
		if (colon <= 0) {
			i++;
			continue;
		}
		const key = line.slice(0, colon).trim();
		const rawValue = line.slice(colon + 1).trim();

		if (rawValue === "|" || rawValue === ">") {
			const block = readBlock(lines, i + 1, indent);
			if (key === "description") preset.description = block.value;
			i = block.next;
			continue;
		}

		if (!rawValue) {
			if (["includeTools", "extensions", "skillDirs", "promptFiles", "promptDirs", "workers"].includes(key)) {
				const arr = readArray(lines, i + 1, indent);
				preset[key] = arr.value;
				i = arr.next;
				continue;
			}
			if (key === "prompt") {
				const nested = readNestedMap(lines, i + 1, indent);
				preset.prompt = nested.value;
				i = nested.next;
				continue;
			}
			if (key === "environment") {
				const nested = readNestedMap(lines, i + 1, indent);
				preset.environment = nested.value;
				i = nested.next;
				continue;
			}
		}

		const value = stripQuotes(rawValue);
		switch (key) {
			case "description":
				preset.description = value;
				break;
			case "userSelectable":
				preset.userSelectable = parseBoolean(value);
				break;
			case "provider":
			case "model":
			case "thinkingLevel":
			case "theme":
				preset[key] = value;
				break;
			case "includeContextFiles":
				preset.includeContextFiles = parseBoolean(value);
				break;
			case "tools":
				if (value === "none" || value === "include") preset.tools = value;
				else preset.tools = value;
				break;
			case "includeTools":
			case "extensions":
			case "skillDirs":
			case "promptFiles":
			case "promptDirs":
			case "workers":
				preset[key] = parseInlineList(value);
				break;
		}
		i++;
	}
	return preset;
}

export function mergePreset(base, next) {
	const merged = base ? { ...base } : emptyPreset(next.name, next.sourceRoot);
	merged.sourceRoot = next.sourceRoot;
	for (const key of [
		"description",
		"userSelectable",
		"provider",
		"model",
		"thinkingLevel",
		"includeContextFiles",
		"theme",
		"tools",
	]) {
		if (next[key] !== undefined) merged[key] = next[key];
	}
	if (next.prompt) merged.prompt = { ...(merged.prompt ?? {}), ...next.prompt };
	if (next.environment) merged.environment = { ...(merged.environment ?? {}), ...next.environment };
	merged.includeTools = unique([...(merged.includeTools ?? []), ...(next.includeTools ?? [])]);
	merged.extensions = unique([...(merged.extensions ?? []), ...(next.extensions ?? [])]);
	merged.skillDirs = unique([...(merged.skillDirs ?? []), ...(next.skillDirs ?? [])]);
	merged.promptFiles = unique([...(merged.promptFiles ?? []), ...(next.promptFiles ?? [])]);
	merged.promptDirs = unique([...(merged.promptDirs ?? []), ...(next.promptDirs ?? [])]);
	merged.workers = unique([...(merged.workers ?? []), ...(next.workers ?? [])]);
	return merged;
}

export function sourceRoots(packageRoot, cwd) {
	const roots = [packageRoot, join(homedir(), ".pi", "mypi")];
	const home = resolve(homedir());
	let cursor = resolve(cwd || process.cwd());
	const projectRoots = [];
	while (cursor.startsWith(home)) {
		const source = join(cursor, ".pi", "mypi");
		if (existsSync(source)) projectRoots.push(source);
		const parent = dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	roots.push(...projectRoots.reverse());
	return roots;
}

export function loadPresetSource(sourceRoot) {
	const registry = new Map();
	const dir = join(sourceRoot, "agents");
	if (!existsSync(dir)) return registry;
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
		const name = file.replace(/\.ya?ml$/, "");
		const raw = readFileSync(join(dir, file), "utf8");
		const parsed = parsePresetYaml(raw, name, sourceRoot);
		registry.set(name, mergePreset(registry.get(name), parsed));
	}
	return registry;
}

export function loadPresets(packageRoot, cwd) {
	const registry = new Map();
	for (const sourceRoot of sourceRoots(packageRoot, cwd)) {
		for (const [name, preset] of loadPresetSource(sourceRoot)) {
			registry.set(name, mergePreset(registry.get(name), preset));
		}
	}
	return registry;
}

export function resolveResourcePath(sourceRoot, resourcePath) {
	if (isAbsolute(resourcePath)) return resourcePath;
	return join(sourceRoot, resourcePath);
}

export function extensionTools(preset) {
	return unique((preset.extensions ?? []).flatMap((id) => EXTENSION_TOOL_NAMES[id] ?? []));
}

export function effectiveTools(preset) {
	if (preset.tools === "none") return [];
	return unique([...(preset.includeTools ?? []), ...extensionTools(preset)]);
}

export function vanillaTools(allToolNames) {
	const presetOnlyTools = new Set(Object.values(EXTENSION_TOOL_NAMES).flat());
	return allToolNames.filter((name) => !presetOnlyTools.has(name));
}

export function effectivePromptBase(preset) {
	const prompt = preset.prompt ?? {};
	return prompt.base ?? (prompt.system ? "templated" : "pi");
}

export function composePrompt(eventSystemPrompt, preset) {
	const prompt = preset.prompt ?? {};
	const base = effectivePromptBase(preset);
	if (base === "raw") return prompt.system ?? "";
	if (base === "templated") {
		const system = prompt.system ?? "";
		const withGenerated = system ? `${system}\n\n${eventSystemPrompt}` : eventSystemPrompt;
		return prompt.append ? `${withGenerated}\n\n${prompt.append}` : withGenerated;
	}
	return prompt.append ? `${eventSystemPrompt}\n\n${prompt.append}` : eventSystemPrompt;
}

export function presetRequiresCleanSession(preset) {
	return (preset.extensions ?? []).includes("workflow-orchestrator") && (preset.workers ?? []).length > 0;
}

function readThemeNames(packageRoot, packageJson) {
	const names = new Set();
	for (const themePath of packageJson?.pi?.themes ?? []) {
		const absolute = join(packageRoot, themePath);
		if (!existsSync(absolute)) continue;
		try {
			const parsed = JSON.parse(readFileSync(absolute, "utf8"));
			if (typeof parsed.name === "string" && parsed.name.trim()) names.add(parsed.name.trim());
		} catch {
			/* reported by validatePresetResources as an unknown theme if referenced */
		}
	}
	return names;
}

export function validatePresetRegistry({ packageRoot, registry, packageJson }) {
	const errors = [];
	const warnings = [];
	const agentsDir = join(packageRoot, "agents");
	if (existsSync(agentsDir)) {
		const dirs = readdirSync(agentsDir).filter((entry) => statSync(join(agentsDir, entry)).isDirectory());
		if (dirs.length) errors.push(`agents/ must contain flat preset YAML only; found directories: ${dirs.join(", ")}`);
	}

	const themeNames = readThemeNames(packageRoot, packageJson);
	for (const preset of registry.values()) {
		validatePreset(preset, registry, themeNames, errors, warnings);
		validatePresetResources(preset, errors);
	}
	return { errors, warnings };
}

function validatePreset(preset, registry, themeNames, errors, warnings) {
	const label = `${preset.name}.yml`;
	if (!preset.description) errors.push(`${label}: missing description`);
	if (preset.userSelectable !== undefined && typeof preset.userSelectable !== "boolean") {
		errors.push(`${label}: userSelectable must be boolean`);
	}
	if (preset.includeContextFiles !== undefined && typeof preset.includeContextFiles !== "boolean") {
		errors.push(`${label}: includeContextFiles must be boolean`);
	}
	if (preset.tools !== undefined && preset.tools !== "none" && preset.tools !== "include") {
		errors.push(`${label}: tools must be "none" or "include"`);
	}
	for (const tool of preset.includeTools ?? []) {
		if (!BUILTIN_TOOL_NAMES.has(tool)) errors.push(`${label}: unknown includeTools entry "${tool}"`);
	}
	if (preset.tools === "none" && (preset.includeTools?.length ?? 0) > 0) {
		errors.push(`${label}: tools: none cannot include built-in tools`);
	}
	if (preset.thinkingLevel && !THINKING_LEVELS.has(preset.thinkingLevel)) {
		errors.push(`${label}: thinkingLevel must be one of ${[...THINKING_LEVELS].join(", ")}`);
	}
	if ((preset.provider && !preset.model) || (!preset.provider && preset.model)) {
		errors.push(`${label}: provider and model must be set together`);
	}
	if (preset.theme && !themeNames.has(preset.theme)) {
		errors.push(`${label}: unknown theme "${preset.theme}"`);
	}

	const base = effectivePromptBase(preset);
	if (!PROMPT_BASES.has(base)) errors.push(`${label}: prompt.base must be pi, templated, or raw`);
	if (base === "raw" && !preset.prompt?.system?.trim()) {
		errors.push(`${label}: prompt.base raw requires non-empty prompt.system`);
	}
	if (preset.includeContextFiles === false && base !== "raw") {
		warnings.push(`${label}: includeContextFiles: false is only strictly enforceable with prompt.base: raw`);
	}

	for (const extensionId of preset.extensions ?? []) {
		if (!Object.hasOwn(EXTENSION_TOOL_NAMES, extensionId)) errors.push(`${label}: unknown extension "${extensionId}"`);
	}
	const hasWorkflowExtension = (preset.extensions ?? []).includes("workflow-orchestrator");
	if (hasWorkflowExtension && (preset.workers?.length ?? 0) === 0) {
		errors.push(`${label}: workflow-orchestrator extension requires at least one worker`);
	}
	if (!hasWorkflowExtension && (preset.workers?.length ?? 0) > 0) {
		errors.push(`${label}: workers require workflow-orchestrator extension`);
	}
	for (const worker of preset.workers ?? []) {
		if (worker === preset.name) errors.push(`${label}: worker list must not reference itself`);
		if (!registry.has(worker)) errors.push(`${label}: unknown worker preset "${worker}"`);
	}

	for (const [key, value] of Object.entries(preset.environment ?? {})) {
		if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) errors.push(`${label}: invalid environment key "${key}"`);
		if (typeof value !== "string") errors.push(`${label}: environment.${key} must be a string`);
	}
}

function validatePresetResources(preset, errors) {
	const label = `${preset.name}.yml`;
	for (const resource of preset.skillDirs ?? []) {
		const absolute = resolveResourcePath(preset.sourceRoot, resource);
		if (!existsSync(absolute)) {
			errors.push(`${label}: skillDirs resource does not exist: ${resource}`);
		} else if (!statSync(absolute).isDirectory()) {
			errors.push(`${label}: ${resource} is not a directory`);
		} else if (!existsSync(join(absolute, "SKILL.md"))) {
			errors.push(`${label}: skill directory missing SKILL.md: ${resource}`);
		}
	}
	for (const resource of preset.promptDirs ?? []) {
		const absolute = resolveResourcePath(preset.sourceRoot, resource);
		if (!existsSync(absolute)) {
			errors.push(`${label}: promptDirs resource does not exist: ${resource}`);
		} else if (!statSync(absolute).isDirectory()) {
			errors.push(`${label}: ${resource} is not a directory`);
		}
	}
	for (const resource of preset.promptFiles ?? []) {
		const absolute = resolveResourcePath(preset.sourceRoot, resource);
		if (!existsSync(absolute)) {
			errors.push(`${label}: promptFiles resource does not exist: ${resource}`);
		} else if (!statSync(absolute).isFile()) {
			errors.push(`${label}: ${resource} is not a file`);
		} else if (basename(absolute).startsWith(".")) {
			errors.push(`${label}: promptFiles resource must not be hidden: ${resource}`);
		}
	}
}
