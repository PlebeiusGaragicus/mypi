export type PromptBase = "pi" | "templated" | "raw";

export interface PresetPrompt {
	base?: PromptBase;
	system?: string;
	append?: string;
}

export interface PresetDefinition {
	name: string;
	sourceRoot: string;
	description?: string;
	userSelectable?: boolean;
	provider?: string;
	model?: string;
	thinkingLevel?: string;
	includeContextFiles?: boolean;
	theme?: string;
	environment?: Record<string, string>;
	prompt?: PresetPrompt;
	tools?: "none" | "include" | string;
	includeTools: string[];
	extensions: string[];
	skillDirs: string[];
	promptFiles: string[];
	promptDirs: string[];
	workers: string[];
}

export const EXTENSION_TOOL_NAMES: Record<string, string[]>;
export const BUILTIN_TOOL_NAMES: Set<string>;
export const THINKING_LEVELS: Set<string>;
export const PROMPT_BASES: Set<string>;

export function emptyPreset(name: string, sourceRoot: string): PresetDefinition;
export function unique(items: string[]): string[];
export function parsePresetYaml(raw: string, name: string, sourceRoot: string): PresetDefinition;
export function mergePreset(base: PresetDefinition | undefined, next: PresetDefinition): PresetDefinition;
export function sourceRoots(packageRoot: string, cwd: string): string[];
export function loadPresetSource(sourceRoot: string): Map<string, PresetDefinition>;
export function loadPresets(packageRoot: string, cwd: string): Map<string, PresetDefinition>;
export function resolveResourcePath(sourceRoot: string, resourcePath: string): string;
export function extensionTools(preset: PresetDefinition): string[];
export function effectiveTools(preset: PresetDefinition): string[];
export function vanillaTools(allToolNames: string[]): string[];
export function effectivePromptBase(preset: PresetDefinition): PromptBase;
export function composePrompt(eventSystemPrompt: string, preset: PresetDefinition): string;
export function presetRequiresCleanSession(preset: PresetDefinition): boolean;
export function validatePresetRegistry(args: {
	packageRoot: string;
	registry: Map<string, PresetDefinition>;
	packageJson?: unknown;
}): { errors: string[]; warnings: string[] };
