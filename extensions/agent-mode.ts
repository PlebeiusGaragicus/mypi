/**
 * Agent mode extension: /agent-mode switches among code, scout, web, editor, and chat.
 * Default: **inactive** (vanilla pi tools, prompts, and discovery) until the user runs `/agent-mode`.
 * When a mode is active, per-profile resources under this package's `agents/<profile>/{skills,prompts,themes}/`
 * are registered via resources_discover (paths anchored to the install root); mode changes reload pi.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Parent of `extensions/` — works for `pi install .`, git installs under ~/.pi, etc. */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type AgentMode = "chat" | "scout" | "code" | "web" | "editor";

const MODES: AgentMode[] = ["code", "scout", "web", "editor", "chat"];

const MODE_TOOLS: Record<AgentMode, string[]> = {
	code: ["ls", "find", "grep", "read", "write", "edit", "bash"],
	scout: ["ls", "find", "grep", "read"],
	web: ["ls", "find", "grep", "read", "bash"],
	editor: ["ls", "find", "grep", "read", "write", "edit"],
	chat: [],
};

const MODE_LABELS: Record<AgentMode, string> = {
	code: "Code",
	scout: "Scout",
	web: "Web",
	editor: "Editor",
	chat: "Chat",
};

/**
 * Subdirectory of `<package>/agents/` for this mode. Expected layout:
 * `agents/<profile>/{skills,prompts,themes}/` (each may be a dir or symlink to `shared/...`).
 */
const AGENT_RESOURCE_PROFILE: Record<AgentMode, string | null> = {
	code: "coder",
	scout: "scout",
	web: "web",
	editor: "editor",
	chat: null,
};

type AgentProfile = NonNullable<(typeof AGENT_RESOURCE_PROFILE)[AgentMode]>;

const CHAT_MODE_INSTRUCTIONS = `You are a helpful assistant in a quick Q&A mode.

You do not have any tools. Answer from general knowledge or ask the user for missing details.

Do not claim to have read the user's files or repository unless the user pasted that content.`;

const SCOUT_MODE_SUFFIX = `

---

## Scout mode

You are in scout (read-only discovery) mode.

- Use only the tools you have been given (typically ls, find, grep, read). Do not assume write, edit, or bash exist.
- Prefer ls, find, and grep over shell pipelines when exploring the tree.
- Do not modify files or run shell commands unless a bash tool is actually available in your tool list.`;

const WEB_MODE_SUFFIX = `

---

## Web mode

You are in web research mode (read-only on disk; bash allowed for HTTP and scripts).

- Prefer the **arxiv-search** skill for arXiv queries and paper fetches: read its \`SKILL.md\` and run scripts from that skill directory.
- Use **bash** for \`curl\`/HTTP checks and for invoking the skill's Python scripts when needed.
- Do not use write or edit unless those tools appear in your available tool list.`;

const EDITOR_MODE_SUFFIX = `

---

## Editor mode

You are in editor mode: file edits and reviews **without** a shell (\`bash\` is not available).

- Use **read**, **grep**, **find**, and **ls** to inspect the codebase; use **write** and **edit** for changes.
- Load the **humanizer** skill when the user wants clearer or more natural prose; follow its \`SKILL.md\` from the skill path shown in the prompt.
- Do not suggest or attempt terminal commands—there is no bash tool in this mode.`;

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

function appendDateAndCwd(cwd: string): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	const date = `${y}-${m}-${d}`;
	const promptCwd = cwd.replace(/\\/g, "/");
	return `\nCurrent date: ${date}\nCurrent working directory: ${promptCwd}`;
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
	if (v === "scout" || v === "code" || v === "web" || v === "editor") return v;
	return undefined;
}

function parseSavedMode(raw: unknown): AgentMode | undefined {
	if (typeof raw !== "string") return undefined;
	if (raw === "chat-only" || raw === "chat") return "chat";
	if (raw === "scout" || raw === "code" || raw === "web" || raw === "editor") return raw as AgentMode;
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
		case "editor":
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
			"Activate or switch agent mode (code | scout | web | editor | chat); inactive until first use — no args opens a selector",
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
		const opts = event.systemPromptOptions;
		if (currentMode === null) {
			return undefined;
		}
		if (currentMode === "code") {
			return undefined;
		}
		if (currentMode === "scout") {
			return {
				systemPrompt: `${event.systemPrompt}${SCOUT_MODE_SUFFIX}`,
			};
		}
		if (currentMode === "web") {
			return {
				systemPrompt: `${event.systemPrompt}${WEB_MODE_SUFFIX}`,
			};
		}
		if (currentMode === "editor") {
			return {
				systemPrompt: `${event.systemPrompt}${EDITOR_MODE_SUFFIX}`,
			};
		}
		const append = opts.appendSystemPrompt ? `\n\n${opts.appendSystemPrompt}` : "";
		return {
			systemPrompt: `${CHAT_MODE_INSTRUCTIONS}${append}${appendDateAndCwd(opts.cwd)}`,
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
