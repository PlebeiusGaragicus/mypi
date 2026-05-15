/**
 * Agent mode extension: /agent-mode switches among code, scout, web, write, chat, and **workflow**; **`pi` turns agent mode off**
 * (same as inactive: vanilla tools, prompts, and discovery). The no-arg selector lists `workflow` before `pi`.
 * Default: **inactive** until the user runs `/agent-mode`.
 * When a mode is active, per-profile resources under this package's `agents/<profile>/{skills,prompts,themes}/`
 * are registered via `resources_discover` (paths anchored to the install root). Mode changes call `ctx.reload()` so
 * skills, prompts, themes, and tools stay in sync.
 *
 * **Workflow mode** expects a session with no prior user messages (deterministic MAS runs). Entering workflow when
 * the branch already has user messages opens a confirmation; Pi cannot always start `/new` programmatically — the user
 * may be asked to run `/new` then `/agent-mode workflow` again. On `session_start`, a saved `workflow` mode is
 * cleared to vanilla if user messages are already present on the branch.
 *
 * **`/fork` / `/clone`:** Pi emits `session_start` with `reason: "fork"` and `previousSessionFile` (parent `.jsonl`).
 * Custom `agent-mode-state` lines are often missing on the forked leaf; we re-read the last such line from the parent
 * file when needed, then `appendEntry` so the new session persists mode.
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
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { createChatPersonaController } from "./chat-personas";

/** Package root (parent of `extensions/`). */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type AgentMode = "chat" | "scout" | "write" | "web" | "code" | "workflow";

/** `pi` is only a selector slot meaning “deactivate agent mode”, not a stored profile. */
type AgentModeSelector = AgentMode | "pi";

const CYCLE_ORDER: AgentModeSelector[] = ["chat", "scout", "write", "web", "code", "workflow", "pi"];

const MODE_TOOLS: Record<AgentMode, string[]> = {
	chat: [],
	scout: ["ls", "find", "grep", "read"],
	write: ["ls", "find", "grep", "read", "write", "edit"],
	web: ["ls", "find", "grep", "read", "bash"],
	code: ["ls", "find", "grep", "read", "write", "edit", "bash"],
	workflow: ["ls", "find", "grep", "read", "write", "edit", "bash", "subagent"],
};

/** Right-hand summary on each `/agent-mode` picker row only — status bar uses the mode id (e.g. `write`). */
const MODE_MENU_DESCRIPTIONS: Record<AgentModeSelector, string> = {
	chat: "no tools — conversation only",
	scout: "read files only",
	write: "read and edit files",
	web: "read files and run shell commands",
	code: "all tools available",
	workflow: "multi-agent workflow orchestrator",
	pi: "agent mode off - vanilla Pi",
};

/** Single-cell markers so each row reads distinctly in the plain-text selector (no Pi UI changes). */
const MODE_SELECT_MARK: Record<AgentModeSelector, string> = {
	chat: "○",
	scout: "◇",
	write: "▲",
	web: "◆",
	code: "■",
	workflow: "◎",
	pi: "·",
};

const MODE_ID_COL = 10;
/** Wide enough for `MODE_TOOLS.code` joined with ", " (alignment before the second ` — `). */
const MODE_TOOLS_COL = 56;

function summarizeToolsForSelect(m: AgentModeSelector): string {
	if (m === "pi") return "—";
	const tools = MODE_TOOLS[m];
	if (tools.length === 0) return "none";
	return tools.join(", ");
}

/**
 * Theme-cycler style: fixed token first for parsing, then ` — ` segments; columns padded for separation.
 * Returned choice is parsed with {@link parseAgentModeSelectChoice}.
 */
function formatAgentModeSelectRow(m: AgentModeSelector): string {
	const id = m.padEnd(MODE_ID_COL);
	const tools = summarizeToolsForSelect(m).padEnd(MODE_TOOLS_COL);
	const mark = MODE_SELECT_MARK[m];
	return `${id} ${mark}  │  ${tools}  —  ${MODE_MENU_DESCRIPTIONS[m]}`;
}

function parseAgentModeSelectChoice(choice: string): AgentModeSelector | undefined {
	const first = choice.trim().split(/\s+/)[0];
	return CYCLE_ORDER.find((mode) => mode === first);
}

/**
 * Subdirectory of `<package>/agents/` for this mode. Expected layout:
 * `agents/<profile>/{skills,prompts,themes}/` (each may be a dir or symlink to `shared/...`).
 * Optional **`SYSTEM.md`** / **`APPEND_SYSTEM.md`** in the same folder: see file header above for merge rules.
 */
const AGENT_RESOURCE_PROFILE: Record<AgentMode, string> = {
	chat: "chat",
	scout: "scout",
	web: "web",
	write: "write",
	code: "code",
	workflow: "workflow",
};

type AgentProfile = (typeof AGENT_RESOURCE_PROFILE)[AgentMode];

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const textParts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const maybeText = part as { type?: unknown; text?: unknown };
		if (maybeText.type === "text" && typeof maybeText.text === "string") {
			textParts.push(maybeText.text);
		}
	}
	return textParts.join("");
}

/** True if the active branch has at least one persisted user message with non-empty text. */
function hasUserMessageOnBranch(ctx: ExtensionContext): boolean {
	for (const entry of ctx.sessionManager.getBranch() as SessionEntry[]) {
		if (entry.type !== "message") continue;
		const message = entry.message as { role?: unknown; content?: unknown };
		if (message.role !== "user") continue;
		if (textFromContent(message.content).trim()) return true;
	}
	return false;
}

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

/** Per-profile skill, prompt, and theme paths under `agents/<profile>/` for the active mode. */
function agentResourcesDiscoverPaths(
	mode: AgentMode,
): { skillPaths?: string[]; promptPaths?: string[]; themePaths?: string[] } {
	const profile = AGENT_RESOURCE_PROFILE[mode];
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

function parseModeArg(value: string): AgentModeSelector | undefined {
	const v = value.trim();
	if (v === "chat-only" || v === "chat") return "chat";
	/** Legacy alias before mode was renamed from `editor` to `write`. */
	if (v === "editor") return "write";
	if (v === "scout" || v === "code" || v === "web" || v === "write" || v === "workflow" || v === "pi") return v;
	return undefined;
}

function parseSavedMode(raw: unknown): AgentMode | undefined {
	if (raw == null) return undefined;
	/** Older sessions stored `"pi"` as a mode; that slot now means “off” — treat as inactive. */
	if (raw === "pi") return undefined;
	if (typeof raw !== "string") return undefined;
	if (raw === "chat-only" || raw === "chat") return "chat";
	/** Legacy session state used `editor` for the write profile. */
	if (raw === "editor") return "write";
	if (raw === "scout" || raw === "code" || raw === "web" || raw === "write" || raw === "workflow") return raw as AgentMode;
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
		case "workflow":
			return "warning";
		default:
			return "muted";
	}
}

function isAgentModeStateEntry(e: unknown): e is AgentModeStateEntry {
	if (!e || typeof e !== "object") return false;
	const o = e as AgentModeStateEntry;
	return o.type === "custom" && o.customType === "agent-mode-state";
}

/** Last `agent-mode-state` custom entry in iteration order (same as scanning `getEntries()` end-to-end). */
function findLastSavedAgentMode(entries: Iterable<unknown>): AgentMode | undefined {
	let lastRaw: unknown;
	for (const e of entries) {
		if (isAgentModeStateEntry(e)) {
			lastRaw = (e as AgentModeStateEntry).data?.mode;
		}
	}
	return parseSavedMode(lastRaw);
}

/** Read a session `.jsonl`; return the mode implied by the last `agent-mode-state` line. */
function readLastAgentModeFromSessionFile(sessionFilePath: string): AgentMode | undefined {
	if (!sessionFilePath || !existsSync(sessionFilePath)) return undefined;
	let text: string;
	try {
		text = readFileSync(sessionFilePath, "utf8");
	} catch {
		return undefined;
	}
	let lastRaw: unknown;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed) as unknown;
		} catch {
			continue;
		}
		if (isAgentModeStateEntry(parsed)) {
			lastRaw = (parsed as AgentModeStateEntry).data?.mode;
		}
	}
	return parseSavedMode(lastRaw);
}

/** `session_start` payload (Pi extensions API). */
interface SessionStartEvent {
	reason?: string;
	previousSessionFile?: string;
}

export default function agentModeExtension(pi: ExtensionAPI): void {
	/** `null` = extension inactive (vanilla pi) until user runs `/agent-mode`. */
	let currentMode: AgentMode | null = null;

	const chatPersonas = createChatPersonaController({
		pi,
		packageRoot: PACKAGE_ROOT,
		getCurrentMode: () => currentMode,
		getChatBaselineTools: () => MODE_TOOLS.chat,
	});
	chatPersonas?.registerPersonaCommand();

	function persistAgentModeState(mode: AgentMode | null): void {
		pi.appendEntry("agent-mode-state", { mode });
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (currentMode === null) {
			ctx.ui.setStatus("agent-mode", undefined);
			return;
		}
		const color = statusThemeColor(currentMode);
		ctx.ui.setStatus("agent-mode", ctx.ui.theme.fg(color, `mode: ${currentMode}`));
	}

	function deactivateAgentMode(ctx: ExtensionContext): void {
		currentMode = null;
		pi.setActiveTools(pi.getAllTools().map((t) => t.name));
		updateStatus(ctx);
		chatPersonas?.updateStatus(ctx);
		persistAgentModeState(null);
		ctx.ui.notify("Agent mode off (vanilla pi)");
	}

	function setMode(mode: AgentMode, ctx: ExtensionContext): void {
		currentMode = mode;
		pi.setActiveTools(MODE_TOOLS[mode]);
		updateStatus(ctx);
		chatPersonas?.updateStatus(ctx);
		persistAgentModeState(mode);
		ctx.ui.notify(`Agent mode: ${mode}`);
	}

	// Run before resources_discover so restored mode is visible on startup/reload.
	pi.on("session_start", async (event, ctx) => {
		currentMode = null;
		const ev = event as SessionStartEvent;
		let restored = findLastSavedAgentMode(ctx.sessionManager.getEntries());
		if (!restored) {
			restored = findLastSavedAgentMode(ctx.sessionManager.getBranch());
		}
		if (!restored && ev.reason === "fork" && ev.previousSessionFile) {
			restored = readLastAgentModeFromSessionFile(ev.previousSessionFile);
			if (restored) {
				persistAgentModeState(restored);
			}
		}
		if (restored) {
			currentMode = restored;
		}

		if (currentMode === "workflow" && hasUserMessageOnBranch(ctx)) {
			currentMode = null;
			persistAgentModeState(null);
			pi.setActiveTools(pi.getAllTools().map((t) => t.name));
			if (ctx.hasUI) {
				ctx.ui.notify(
					"Workflow mode was cleared: this session already has user messages. Run /new, then /agent-mode workflow.",
					"warning",
				);
			}
		} else if (currentMode !== null) {
			pi.setActiveTools(MODE_TOOLS[currentMode]);
			// After bindExtensions returns, pi registers discovered themes; then apply the
			// profile theme (see dot-pi auto-theme). Macrotask runs after reload reapplies
			// settings theme so we still win for the active agent.
			const modeForTheme = currentMode;
			setTimeout(() => {
				applyProfileThemeIfNeeded(ctx, modeForTheme);
			}, 0);
		}
		chatPersonas?.sessionStart(ctx, {
			reason: ev.reason,
			previousSessionFile: ev.previousSessionFile,
		});
		updateStatus(ctx);
	});

	pi.on("resources_discover", async () => {
		if (currentMode === null) return {};
		const paths = agentResourcesDiscoverPaths(currentMode);
		const extraSkills = chatPersonas?.extraSkillPaths();
		if (extraSkills?.length) {
			const merged = [...(paths.skillPaths ?? []), ...extraSkills];
			paths.skillPaths = [...new Set(merged)];
		}
		if (!paths.skillPaths && !paths.promptPaths && !paths.themePaths) return {};
		return paths;
	});

	pi.registerCommand("agent-mode", {
		description:
			"Activate or switch agent mode (code | scout | web | write | chat | workflow); use pi to turn agent mode off — inactive until first use; no args opens a selector",
		getArgumentCompletions: (prefix) => {
			const matches = CYCLE_ORDER.filter((m) => m.startsWith(prefix));
			if (matches.length === 0) return null;
			return matches.map((m) => ({ value: m, label: formatAgentModeSelectRow(m) }));
		},
		handler: async (args, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();
			let next: AgentModeSelector | undefined;
			if (!trimmed) {
				const items = CYCLE_ORDER.map((m) => formatAgentModeSelectRow(m));
				const choice = await ctx.ui.select("Agent mode", items);
				if (!choice) return;
				next = parseAgentModeSelectChoice(choice);
				if (!next) return;
			} else {
				const parsed = parseModeArg(trimmed);
				if (!parsed) {
					ctx.ui.notify(`Unknown mode "${trimmed}". Use: ${CYCLE_ORDER.join(", ")}`, "error");
					return;
				}
				next = parsed;
			}

			if (next === "pi") {
				if (currentMode === null) {
					ctx.ui.notify("Agent mode is already off.", "info");
					return;
				}
				deactivateAgentMode(ctx);
				ctx.ui.notify("Reloading so agent resources (skills, prompts, themes) update…", "info");
				await ctx.reload();
				return;
			}

			if (currentMode !== null && next === currentMode) {
				ctx.ui.notify(`Already using ${next}`, "info");
				return;
			}

			if (next === "workflow" && hasUserMessageOnBranch(ctx)) {
				const confirm = await ctx.ui.select(
					"Workflow mode works best with a clean transcript. A new session is recommended when you already have user messages here.",
					["Cancel", "Start new session"],
				);
				if (confirm !== "Start new session") return;
				ctx.ui.notify("Run `/new` for a fresh session, then run `/agent-mode workflow` again.", "info");
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

		const systemMd = readSystemMd(profile);
		const appendMd = readAppendSystemMd(profile);

		const hadProfileMd = !!(systemMd || appendMd);
		let effectiveBase: string;
		if (systemMd && appendMd) {
			effectiveBase = `${systemMd}\n\n${appendMd}`;
		} else if (systemMd) {
			effectiveBase = systemMd;
		} else if (appendMd) {
			effectiveBase = `${event.systemPrompt}\n\n${appendMd}`;
		} else {
			effectiveBase = event.systemPrompt;
		}

		const finalPrompt = chatPersonas ? chatPersonas.beforeAgentStart(effectiveBase) : effectiveBase;

		if (!hadProfileMd && finalPrompt === event.systemPrompt) {
			return undefined;
		}
		return { systemPrompt: finalPrompt };
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus("agent-mode", undefined);
		chatPersonas?.clearStatus(ctx);
	});
}
