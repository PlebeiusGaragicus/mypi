// @ts-nocheck
import "./bootstrap";

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { syncFlowHeader } from "../mypi-branding/flow-title";
import { registerMypiEnvConfig } from "./config-command";
import { setActivePresetState } from "../../shared/presets/state";
import {
	composePrompt,
	effectivePromptBase,
	effectiveTools,
	loadPresets,
	presetRequiresCleanSession,
	resolveResourcePath,
	unique,
	vanillaTools,
	type PresetDefinition,
} from "../../shared/presets/runtime.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRESET_CUSTOM_TYPE = "mypi-preset-state";

interface PresetStateEntry {
	type?: string;
	customType?: string;
	data?: { preset?: unknown };
}

interface SessionStartEvent {
	reason?: string;
	previousSessionFile?: string;
}

type ExtensionContextWithOptionalCwd = ExtensionContext & { cwd?: string };
type CommandContextWithOptionalCwd = ExtensionCommandContext & { cwd?: string };
type PresetSystemPromptEvent = {
	systemPrompt: string;
	systemPromptOptions?: { contextFiles?: unknown };
};

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const maybe = part as { type?: unknown; text?: unknown };
			return maybe.type === "text" && typeof maybe.text === "string" ? maybe.text : "";
		})
		.join("");
}

function hasUserMessageOnBranch(ctx: ExtensionContext): boolean {
	for (const entry of ctx.sessionManager.getBranch() as SessionEntry[]) {
		if (entry.type !== "message") continue;
		const message = entry.message as { role?: unknown; content?: unknown };
		if (message.role === "user" && textFromContent(message.content).trim()) return true;
	}
	return false;
}

function isPresetStateEntry(entry: unknown): entry is PresetStateEntry {
	if (!entry || typeof entry !== "object") return false;
	const maybe = entry as PresetStateEntry;
	return maybe.type === "custom" && maybe.customType === PRESET_CUSTOM_TYPE;
}

function normalizePresetName(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const value = raw.trim();
	if (!value || value === "pi") return null;
	return value;
}

function findLastSavedPreset(entries: Iterable<unknown>): string | null {
	let last: string | null = null;
	for (const entry of entries) {
		if (!isPresetStateEntry(entry)) continue;
		last = normalizePresetName(entry.data?.preset);
	}
	return last;
}

function readLastPresetFromSessionFile(sessionFilePath: string): string | null {
	if (!sessionFilePath || !existsSync(sessionFilePath)) return null;
	let text = "";
	try {
		text = readFileSync(sessionFilePath, "utf8");
	} catch {
		return null;
	}
	let last: string | null = null;
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line) as unknown;
			if (isPresetStateEntry(parsed)) last = normalizePresetName(parsed.data?.preset);
		} catch {
			/* ignore malformed session lines */
		}
	}
	return last;
}

function formatPresetRow(preset: PresetDefinition, activeName: string | null): string {
	const marker = preset.name === activeName ? "*" : " ";
	const tools = effectiveTools(preset).join(", ") || "none";
	const description = preset.description ? ` - ${preset.description}` : "";
	return `${preset.name.padEnd(16)} ${marker} ${tools}${description}`;
}

function parseChoice(choice: string): string {
	return choice.trim().split(/\s+/)[0] ?? "";
}

function getCwd(ctx: ExtensionContextWithOptionalCwd | CommandContextWithOptionalCwd): string {
	return ctx.cwd ?? process.cwd();
}

async function applyModelAndThinking(pi: ExtensionAPI, ctx: ExtensionContext, preset: PresetDefinition): Promise<void> {
	const piApi = pi as ExtensionAPI & {
		setModel?: (model: unknown) => boolean | Promise<boolean>;
		setThinkingLevel?: (level: string) => void | Promise<void>;
	};
	const ctxWithModel = ctx as ExtensionContext & {
		modelRegistry?: { find?: (provider: string, model: string) => unknown };
	};

	if (preset.provider && preset.model) {
		const resolved = ctxWithModel.modelRegistry?.find?.(preset.provider, preset.model);
		const modelArg = resolved ?? `${preset.provider}/${preset.model}`;
		if (piApi.setModel) {
			try {
				const applied = await piApi.setModel(modelArg);
				if (applied === false && ctx.hasUI) {
					ctx.ui.notify(`Preset "${preset.name}" could not activate model ${preset.provider}/${preset.model}.`, "warning");
				}
			} catch (error) {
				if (ctx.hasUI) {
					const msg = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Preset "${preset.name}" model activation failed: ${msg}`, "warning");
				}
			}
		} else if (ctx.hasUI) {
			ctx.ui.notify("This Pi build does not expose model switching to extensions.", "warning");
		}
	}

	if (preset.thinkingLevel) {
		if (piApi.setThinkingLevel) {
			try {
				await piApi.setThinkingLevel(preset.thinkingLevel);
			} catch (error) {
				if (ctx.hasUI) {
					const msg = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Preset "${preset.name}" thinking level failed: ${msg}`, "warning");
				}
			}
		} else if (ctx.hasUI) {
			ctx.ui.notify("This Pi build does not expose thinking-level switching to extensions.", "warning");
		}
	}
}

class PresetEnvironmentOverlay {
	private previous = new Map<string, string | undefined>();

	apply(environment: Record<string, string> | undefined): void {
		this.restore();
		for (const [key, value] of Object.entries(environment ?? {})) {
			this.previous.set(key, process.env[key]);
			process.env[key] = value;
		}
	}

	restore(): void {
		for (const [key, value] of this.previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		this.previous.clear();
	}
}

function maybeWarnContextLimitation(ctx: ExtensionContext, preset: PresetDefinition): void {
	if (preset.includeContextFiles !== false) return;
	if (effectivePromptBase(preset) === "raw") return;
	if (ctx.hasUI) {
		ctx.ui.notify(
			`Preset "${preset.name}" disables context files, but this Pi build only enforces that strictly for raw prompts.`,
			"warning",
		);
	}
}

function contextFileTextParts(contextFiles: unknown): string[] {
	if (!Array.isArray(contextFiles)) return [];
	const out: string[] = [];
	for (const item of contextFiles) {
		if (typeof item === "string") {
			out.push(item);
			continue;
		}
		if (!item || typeof item !== "object") continue;
		const maybe = item as { content?: unknown; text?: unknown };
		for (const value of [maybe.content, maybe.text]) {
			if (typeof value === "string" && value.trim()) out.push(value);
		}
	}
	return out;
}

function removeContextFileText(systemPrompt: string, contextFiles: unknown): string {
	let next = systemPrompt;
	for (const text of contextFileTextParts(contextFiles)) {
		next = next.split(text).join("");
	}
	return next;
}

export default function presetExtension(pi: ExtensionAPI): void {
	registerMypiEnvConfig(pi);
	pi.registerFlag("preset", {
		description: "Select a mypi preset by name",
		type: "string",
		default: "",
	});

	let registry = loadPresets(PACKAGE_ROOT, process.cwd()) as Map<string, PresetDefinition>;
	let currentPreset: PresetDefinition | null = null;
	const environmentOverlay = new PresetEnvironmentOverlay();

	function publishActivePreset(): void {
		setActivePresetState(
			currentPreset
				? {
						name: currentPreset.name,
						description: currentPreset.description,
						extensions: currentPreset.extensions,
						workers: currentPreset.workers,
					}
				: null,
		);
	}

	function activePresetState() {
		return currentPreset
			? {
					name: currentPreset.name,
					description: currentPreset.description,
					extensions: currentPreset.extensions,
					workers: currentPreset.workers,
				}
			: null;
	}

	function persistPresetState(preset: PresetDefinition | null): void {
		pi.appendEntry(PRESET_CUSTOM_TYPE, { preset: preset?.name ?? null });
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (!currentPreset) {
			ctx.ui.setStatus("preset", undefined);
			return;
		}
		ctx.ui.setStatus("preset", ctx.ui.theme.fg("accent", `preset: ${currentPreset.name}`));
	}

	function deactivate(ctx: ExtensionContext): void {
		currentPreset = null;
		environmentOverlay.restore();
		setActivePresetState(null);
		pi.setActiveTools(vanillaTools(pi.getAllTools().map((tool) => tool.name)));
		persistPresetState(null);
		updateStatus(ctx);
		syncFlowHeader(ctx, null);
		ctx.ui.notify("Preset off (vanilla pi)");
	}

	async function activate(preset: PresetDefinition, ctx: ExtensionContext, persist = true): Promise<void> {
		currentPreset = preset;
		environmentOverlay.apply(preset.environment);
		publishActivePreset();
		pi.setActiveTools(effectiveTools(preset));
		await applyModelAndThinking(pi, ctx, preset);
		maybeWarnContextLimitation(ctx, preset);
		if (ctx.hasUI && preset.theme) ctx.ui.setTheme(preset.theme);
		if (persist) persistPresetState(preset);
		updateStatus(ctx);
		syncFlowHeader(ctx, activePresetState());
	}

	pi.on("session_start", async (event, ctx) => {
		const ev = event as SessionStartEvent;
		registry = loadPresets(PACKAGE_ROOT, getCwd(ctx)) as Map<string, PresetDefinition>;
		currentPreset = null;
		environmentOverlay.restore();
		setActivePresetState(null);

		const cliPreset = normalizePresetName(pi.getFlag("preset"));
		let restored = cliPreset;
		// "reload" re-reads the current session; "resume" loads a prior session's
		// entries; "startup" covers `pi --continue`-style launches into an existing
		// session. In all three the loaded entries carry the saved preset state —
		// a genuinely fresh session simply has none, so this is a no-op there.
		if (!restored && (ev.reason === "reload" || ev.reason === "resume" || ev.reason === "startup")) {
			restored = findLastSavedPreset(ctx.sessionManager.getEntries());
		}
		if (!restored && ev.reason === "fork" && ev.previousSessionFile) {
			restored = readLastPresetFromSessionFile(ev.previousSessionFile);
			if (restored) pi.appendEntry(PRESET_CUSTOM_TYPE, { preset: restored });
		}

		const preset = restored ? registry.get(restored) : undefined;
		if (restored && !preset && ctx.hasUI) {
			ctx.ui.notify(`Unknown preset "${restored}". Run /preset to choose one.`, "error");
		}
		if (preset) {
			if (presetRequiresCleanSession(preset) && hasUserMessageOnBranch(ctx)) {
				persistPresetState(null);
				pi.setActiveTools(vanillaTools(pi.getAllTools().map((tool) => tool.name)));
				ctx.ui.notify(
					`Preset "${preset.name}" was cleared: workflow presets should start from a clean session. Run /new, then /preset ${preset.name}.`,
					"warning",
				);
			} else {
				await activate(preset, ctx, false);
			}
		} else {
			pi.setActiveTools(vanillaTools(pi.getAllTools().map((tool) => tool.name)));
		}
		updateStatus(ctx);
		syncFlowHeader(ctx, activePresetState());
	});

	pi.on("resources_discover", async () => {
		if (!currentPreset) return {};
		const skillPaths = currentPreset.skillDirs
			.map((item) => resolveResourcePath(currentPreset!.sourceRoot, item))
			.filter((item) => existsSync(item));
		const promptPaths = [...currentPreset.promptFiles, ...currentPreset.promptDirs]
			.map((item) => resolveResourcePath(currentPreset!.sourceRoot, item))
			.filter((item) => existsSync(item));
		const out: { skillPaths?: string[]; promptPaths?: string[] } = {};
		if (skillPaths.length) out.skillPaths = unique(skillPaths);
		if (promptPaths.length) out.promptPaths = unique(promptPaths);
		return out;
	});

	pi.registerCommand("preset", {
		description: "Activate or switch mypi preset; use pi to return to vanilla Pi",
		getArgumentCompletions: (prefix) => {
			const names = [...registry.values()]
				.filter((preset) => preset.userSelectable !== false)
				.map((preset) => preset.name)
				.concat("pi")
				.filter((name) => name.startsWith(prefix));
			if (names.length === 0) return null;
			return names.map((name) => ({ value: name, label: name }));
		},
		handler: async (args, ctx: ExtensionCommandContext) => {
			registry = loadPresets(PACKAGE_ROOT, getCwd(ctx)) as Map<string, PresetDefinition>;
			const trimmed = args.trim();
			let nextName = trimmed;
			if (!nextName) {
				const selectable = [...registry.values()].filter((preset) => preset.userSelectable !== false);
				const rows = [
					...selectable.map((preset) => formatPresetRow(preset, currentPreset?.name ?? null)),
					"pi               vanilla Pi",
				];
				const choice = await ctx.ui.select("Preset", rows);
				if (!choice) return;
				nextName = parseChoice(choice);
			}

			if (nextName === "pi") {
				deactivate(ctx);
				ctx.ui.notify("Reloading so preset resources update...", "info");
				await ctx.reload();
				return;
			}

			const preset = registry.get(nextName);
			if (!preset) {
				ctx.ui.notify(`Unknown preset "${nextName}".`, "error");
				return;
			}
			if (currentPreset?.name === preset.name) {
				ctx.ui.notify(`Already using preset "${preset.name}".`, "info");
				return;
			}
			if (presetRequiresCleanSession(preset) && hasUserMessageOnBranch(ctx)) {
				const confirm = await ctx.ui.select(
					`Preset "${preset.name}" is a workflow preset and should start from a clean transcript.`,
					["Cancel", "Start new session"],
				);
				if (confirm !== "Start new session") return;
				ctx.ui.notify(`Run /new, then /preset ${preset.name}.`, "info");
				return;
			}
			await activate(preset, ctx);
			ctx.ui.notify(`Preset: ${preset.name}`, "info");
			ctx.ui.notify("Reloading so preset resources update...", "info");
			await ctx.reload();
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (!currentPreset) return undefined;
		const ev = event as PresetSystemPromptEvent;
		const basePrompt =
			currentPreset.includeContextFiles === false
				? removeContextFileText(ev.systemPrompt, ev.systemPromptOptions?.contextFiles)
				: ev.systemPrompt;
		const systemPrompt = composePrompt(basePrompt, currentPreset);
		if (systemPrompt === ev.systemPrompt) return undefined;
		return { systemPrompt };
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		environmentOverlay.restore();
		if (ctx.hasUI) ctx.ui.setStatus("preset", undefined);
		setActivePresetState(null);
	});
}
