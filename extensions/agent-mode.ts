/**
 * Agent mode extension: /agent-mode switches among code, scout, web, write, and chat.
 * Default: **inactive** (vanilla pi tools, prompts, and discovery) until the user runs `/agent-mode`.
 * When a mode is active, per-profile resources under this package's `agents/<profile>/{skills,prompts,themes}/`
 * are registered via resources_discover (paths anchored to the install root); mode changes reload pi.
 *
 * Per active profile under `agents/<profile>/`, optional markdown files control the system prompt (no
 * mode-specific branching):
 *
 * - **`SYSTEM.md`** (non-empty): **replaces** Pi's default **`event.systemPrompt`** for that session turn.
 * - **`APPEND_SYSTEM.md`** (non-empty): **appends** after the effective base. If both files exist, order is
 *   `SYSTEM.md` then `APPEND_SYSTEM.md`. If neither exists, the extension does not modify the prompt.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Parent of `extensions/` — works for `pi install .`, git installs under ~/.pi, etc. */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type AgentMode = "chat" | "scout" | "code" | "web" | "write";

const MODES: AgentMode[] = ["code", "scout", "web", "write", "chat"];

const MODE_TOOLS: Record<AgentMode, string[]> = {
	chat: [],
	scout: ["ls", "find", "grep", "read"],
	web: ["ls", "find", "grep", "read", "bash"],
	write: ["ls", "find", "grep", "read", "write", "edit"],
	code: ["ls", "find", "grep", "read", "write", "edit", "bash"],
};

const MODE_LABELS: Record<AgentMode, string> = {
	code: "Code",
	scout: "Scout",
	web: "Web",
	write: "Write",
	chat: "Chat",
};

/**
 * Subdirectory of `<package>/agents/` for this mode. Expected layout:
 * `agents/<profile>/{skills,prompts,themes}/` (each may be a dir or symlink to `shared/...`).
 * Optional **`SYSTEM.md`** / **`APPEND_SYSTEM.md`** in the same folder: see file header above for merge rules.
 */
const AGENT_RESOURCE_PROFILE: Record<AgentMode, string | null> = {
	chat: "chat",
	scout: "scout",
	web: "web",
	write: "write",
	code: "code",
};

type AgentProfile = NonNullable<(typeof AGENT_RESOURCE_PROFILE)[AgentMode]>;

function readSystemMd(profile: string): string | undefined {
	const filePath = join(PACKAGE_ROOT, "agents", profile, "SYSTEM.md");
	if (!existsSync(filePath)) return undefined;
	const text = readFileSync(filePath, "utf8").trim();
	return text.length > 0 ? text : undefined;
}

function readAppendSystemMd(profile: string): string | undefined {
	const filePath = join(PACKAGE_ROOT, "agents", profile, "APPEND_SYSTEM.md");
	if (!existsSync(filePath)) return undefined;
	const text = readFileSync(filePath, "utf8").trim();
	return text.length > 0 ? text : undefined;
}

/** `<package>/agents/<profile>/themes` for modes that ship per-profile themes. */
function profileThemesDir(profile: AgentProfile): string {
	return join(PACKAGE_ROOT, "agents", profile, "themes");
}

/**
 * Apply the first discovered theme whose name matches a `.json` in the profile's
 * `themes/` folder (same idea as dot-pi `auto-theme`: symlinked defaults without
 * editing settings). Deferred so `resources_discover` themes are registered first.
 */
function applyProfileThemeIfNeeded(ctx: ExtensionContext, mode: AgentMode): void {
	if (!ctx.hasUI) return;
	const profile = AGENT_RESOURCE_PROFILE[mode];
	if (!profile) return;

	const dir = profileThemesDir(profile);
	if (!existsSync(dir)) return;

	const customNames = new Set(
		readdirSync(dir)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.slice(0, -5)),
	);
	if (customNames.size === 0) return;

	const themes = ctx.ui.getAllThemes();
	const custom = themes.find((t) => customNames.has(t.name));
	if (custom && ctx.ui.theme.name !== custom.name) {
		ctx.ui.setTheme(custom.name);
	}
}

/** Extra skill / prompt / theme roots for the active mode (pi merges with defaults). */
function agentResourcesDiscoverPaths(
	mode: AgentMode,
): { skillPaths?: string[]; promptPaths?: string[]; themePaths?: string[] } {
	const profile = AGENT_RESOURCE_PROFILE[mode];
	if (!profile) return {};

	const base = join(PACKAGE_ROOT, "agents", profile);
	const skillsDir = join(base, "skills");
	const promptsDir = join(base, "prompts");
	const themesDir = join(base, "themes");
	const out: { skillPaths?: string[]; promptPaths?: string[]; themePaths?: string[] } = {};
	if (existsSync(skillsDir)) out.skillPaths = [skillsDir];
	if (existsSync(promptsDir)) out.promptPaths = [promptsDir];
	if (existsSync(themesDir)) out.themePaths = [themesDir];
	if (!out.skillPaths && !out.promptPaths && !out.themePaths) return {};
	return out;
}

function parseModeArg(value: string): AgentMode | undefined {
	const v = value.trim();
	if (v === "chat-only" || v === "chat") return "chat";
	/** Legacy alias before mode was renamed from `editor` to `write`. */
	if (v === "editor") return "write";
	if (v === "scout" || v === "code" || v === "web" || v === "write") return v;
	return undefined;
}

function parseSavedMode(raw: unknown): AgentMode | undefined {
	if (typeof raw !== "string") return undefined;
	if (raw === "chat-only" || raw === "chat") return "chat";
	/** Legacy session state used `editor` for the write profile. */
	if (raw === "editor") return "write";
	if (raw === "scout" || raw === "code" || raw === "web" || raw === "write") return raw as AgentMode;
	return undefined;
}

interface AgentModeStateEntry {
	type?: string;
	customType?: string;
	data?: { mode?: unknown };
}

function statusThemeColor(mode: AgentMode): "accent" | "warning" | "success" | "muted" {
	switch (mode) {
		case "code":
			return "accent";
		case "scout":
			return "warning";
		case "web":
			return "success";
		case "write":
			return "accent";
		default:
			return "muted";
	}
}

export default function agentModeExtension(pi: ExtensionAPI): void {
	/** `null` = extension inactive (vanilla pi) until user runs `/agent-mode`. */
	let currentMode: AgentMode | null = null;

	function persistMode(): void {
		if (currentMode === null) return;
		pi.appendEntry("agent-mode-state", { mode: currentMode });
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (currentMode === null) {
			ctx.ui.setStatus("agent-mode", undefined);
			return;
		}
		const label = MODE_LABELS[currentMode];
		const color = statusThemeColor(currentMode);
		ctx.ui.setStatus("agent-mode", ctx.ui.theme.fg(color, `mode: ${label}`));
	}

	function setMode(mode: AgentMode, ctx: ExtensionContext): void {
		currentMode = mode;
		pi.setActiveTools(MODE_TOOLS[mode]);
		updateStatus(ctx);
		persistMode();
		ctx.ui.notify(`Agent mode: ${MODE_LABELS[mode]}`);
	}

	// Run before resources_discover so restored mode is visible on startup/reload.
	pi.on("session_start", async (_event, ctx) => {
		currentMode = null;
		const entries = ctx.sessionManager.getEntries();
		const last = entries.filter(isAgentModeStateEntry).pop() as AgentModeStateEntry | undefined;
		const saved = last?.data?.mode;
		const restored = parseSavedMode(saved);
		if (restored) {
			currentMode = restored;
		}

		if (currentMode !== null) {
			pi.setActiveTools(MODE_TOOLS[currentMode]);
			// After bindExtensions returns, pi registers discovered themes; then apply the
			// profile theme (see dot-pi auto-theme). Macrotask runs after reload reapplies
			// settings theme so we still win for the active agent.
			const modeForTheme = currentMode;
			setTimeout(() => {
				applyProfileThemeIfNeeded(ctx, modeForTheme);
			}, 0);
		}
		updateStatus(ctx);
	});

	pi.on("resources_discover", async () => {
		if (currentMode === null) return {};
		const paths = agentResourcesDiscoverPaths(currentMode);
		if (!paths.skillPaths && !paths.promptPaths && !paths.themePaths) return {};
		return paths;
	});

	pi.registerCommand("agent-mode", {
		description:
			"Activate or switch agent mode (code | scout | web | write | chat); inactive until first use — no args opens a selector",
		getArgumentCompletions: (prefix) => {
			const matches = MODES.filter((m) => m.startsWith(prefix));
			if (matches.length === 0) return null;
			return matches.map((m) => ({ value: m, label: `${m} (${MODE_LABELS[m]})` }));
		},
		handler: async (args, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();
			let next: AgentMode | undefined;
			if (!trimmed) {
				const items = MODES.map((m) => `${m} (${MODE_LABELS[m]})`);
				const choice = await ctx.ui.select("Agent mode", items);
				if (!choice) return;
				next = MODES.find((m) => choice.startsWith(`${m} (`));
				if (!next) return;
			} else {
				const parsed = parseModeArg(trimmed);
				if (!parsed) {
					ctx.ui.notify(`Unknown mode "${trimmed}". Use: ${MODES.join(", ")}`, "error");
					return;
				}
				next = parsed;
			}

			if (currentMode !== null && next === currentMode) {
				ctx.ui.notify(`Already in ${MODE_LABELS[next]} mode.`, "info");
				return;
			}

			setMode(next, ctx);
			ctx.ui.notify("Reloading so agent resources (skills, prompts, themes) update…", "info");
			await ctx.reload();
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (currentMode === null) {
			return undefined;
		}
		const profile = AGENT_RESOURCE_PROFILE[currentMode];
		if (!profile) {
			return undefined;
		}

		const systemMd = readSystemMd(profile);
		const appendMd = readAppendSystemMd(profile);

		if (!systemMd && !appendMd) {
			return undefined;
		}

		if (systemMd && appendMd) {
			return { systemPrompt: `${systemMd}\n\n${appendMd}` };
		}
		if (systemMd) {
			return { systemPrompt: systemMd };
		}
		return {
			systemPrompt: `${event.systemPrompt}\n\n${appendMd}`,
		};
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus("agent-mode", undefined);
	});
}

function isAgentModeStateEntry(e: unknown): e is AgentModeStateEntry {
	if (!e || typeof e !== "object") return false;
	const o = e as AgentModeStateEntry;
	return o.type === "custom" && o.customType === "agent-mode-state";
}
