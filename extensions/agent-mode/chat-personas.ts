/**
 * Chat-mode personas: markdown overlays under `agents/chat/personas/`, `/persona` command,
 * `--persona` CLI flag, session persistence (`customType` `personas`), optional tools/skills/theme in frontmatter.
 * Only applies when agent mode is `chat`. Slash command is not registered for `PI_IS_SUBAGENT` workers.
 * With no active persona, the chat profile alone applies (`agents/chat/SYSTEM.md` / `APPEND_SYSTEM.md` via agent-mode).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const PERSONAS_CUSTOM_TYPE = "personas";

type PersonaMode = "append" | "prepend" | "replace";

export interface PersonaConfig {
	description?: string;
	mode: PersonaMode;
	tools?: string[];
	skills?: string[];
	theme?: string;
}

export interface PersonaFile {
	body: string;
	config: PersonaConfig;
}

function splitCsv(value: unknown): string[] | undefined {
	if (typeof value !== "string" || !value.trim()) return undefined;
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseMode(value: unknown): PersonaMode {
	if (value === "append" || value === "prepend" || value === "replace") return value;
	return "append";
}

/** Minimal `---` YAML frontmatter (single-line `key: value` lines). */
export function parsePersonaFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
	const lines = raw.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") {
		return { frontmatter: {}, body: raw };
	}
	const yamlLines: string[] = [];
	let i = 1;
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line?.trim() === "---") {
			i++;
			break;
		}
		yamlLines.push(line ?? "");
	}
	const body = lines.slice(i).join("\n");
	const frontmatter: Record<string, string> = {};
	for (const line of yamlLines) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const colon = t.indexOf(":");
		if (colon <= 0) continue;
		const key = t.slice(0, colon).trim();
		let val = t.slice(colon + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		frontmatter[key] = val;
	}
	return { frontmatter, body };
}

export function chatPersonasDir(packageRoot: string): string {
	return join(packageRoot, "agents", "chat", "personas");
}

export function loadPersonas(dir: string): Map<string, PersonaFile> {
	const out = new Map<string, PersonaFile>();
	if (!existsSync(dir) || !statSync(dir).isDirectory()) return out;
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".md")) continue;
		const name = basename(file, ".md").toLowerCase();
		try {
			const raw = readFileSync(join(dir, file), "utf-8");
			const { frontmatter, body } = parsePersonaFrontmatter(raw);
			const trimmed = body.trim();
			if (!trimmed) continue;
			const config: PersonaConfig = {
				description: typeof frontmatter.description === "string" ? frontmatter.description.trim() || undefined : undefined,
				mode: parseMode(frontmatter.mode),
				tools: splitCsv(frontmatter.tools),
				skills: splitCsv(frontmatter.skills),
				theme: typeof frontmatter.theme === "string" ? frontmatter.theme.trim() || undefined : undefined,
			};
			out.set(name, { body: trimmed, config });
		} catch {
			/* skip */
		}
	}
	return out;
}

export function normalizePersonaName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.trim().toLowerCase();
	return name || null;
}

export function composeSystemPrompt(basePrompt: string, name: string, persona: PersonaFile): string {
	if (persona.config.mode === "replace") return persona.body;

	const block = [`## Persona: ${name}`, "", persona.body].join("\n");
	if (persona.config.mode === "prepend") return `${block}\n\n${basePrompt}`;
	return `${basePrompt}\n\n${block}`;
}

interface PersonaStateEntry {
	type?: string;
	customType?: string;
	data?: { persona?: unknown };
}

function isPersonaStateEntry(e: unknown): e is PersonaStateEntry {
	if (!e || typeof e !== "object") return false;
	const o = e as PersonaStateEntry;
	return o.type === "custom" && o.customType === PERSONAS_CUSTOM_TYPE;
}

export function findLastSavedPersona(entries: Iterable<unknown>): string | null {
	let lastRaw: unknown;
	for (const e of entries) {
		if (isPersonaStateEntry(e)) {
			lastRaw = (e as PersonaStateEntry).data?.persona;
		}
	}
	if (typeof lastRaw === "string" && lastRaw.trim()) return lastRaw.trim().toLowerCase();
	return null;
}

export function readLastPersonaFromSessionFile(sessionFilePath: string): string | null {
	if (!sessionFilePath || !existsSync(sessionFilePath)) return null;
	let text: string;
	try {
		text = readFileSync(sessionFilePath, "utf8");
	} catch {
		return null;
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
		if (isPersonaStateEntry(parsed)) {
			lastRaw = (parsed as PersonaStateEntry).data?.persona;
		}
	}
	if (typeof lastRaw === "string" && lastRaw.trim()) return lastRaw.trim().toLowerCase();
	return null;
}

export type GetCurrentMode = () => "chat" | "scout" | "write" | "web" | "code" | "workflow" | null;

export interface ChatPersonaControllerOptions {
	pi: ExtensionAPI;
	packageRoot: string;
	getCurrentMode: GetCurrentMode;
	/** Tool names for chat profile when no persona overrides tools (e.g. `[]`). */
	getChatBaselineTools: () => string[];
}

export interface ChatPersonaController {
	readonly personas: Map<string, PersonaFile>;
	readonly chatAgentRoot: string;
	sessionStart(
		ctx: ExtensionContext,
		opts: { reason?: string; previousSessionFile?: string },
	): void;
	beforeAgentStart(basePrompt: string): string;
	extraSkillPaths(): string[] | undefined;
	registerPersonaCommand(): void;
	updateStatus(ctx: ExtensionContext): void;
	clearStatus(ctx: ExtensionContext): void;
	persistPersona(): void;
}

export function createChatPersonaController(options: ChatPersonaControllerOptions): ChatPersonaController | null {
	const { pi, packageRoot, getCurrentMode, getChatBaselineTools } = options;
	const chatAgentRoot = join(packageRoot, "agents", "chat");
	const personasDir = chatPersonasDir(packageRoot);
	const personas = loadPersonas(personasDir);
	if (personas.size === 0) return null;

	const isSubagent = process.env.PI_IS_SUBAGENT === "1";
	let activePersona: string | null = null;
	let baselineTools: string[] | null = null;
	let baselineTheme: string | null = null;

	function listNames(): string {
		return [...personas.keys()].sort().join(", ") || "(none)";
	}

	function captureBaseline(ctx: ExtensionContext): void {
		if (baselineTools === null) baselineTools = [...pi.getActiveTools()];
		if (ctx.hasUI && baselineTheme === null) baselineTheme = ctx.ui.theme.name ?? null;
	}

	function previousPersonaHasSkills(): boolean {
		if (!activePersona) return false;
		const persona = personas.get(activePersona);
		return !!persona?.config.skills?.length;
	}

	function applyPersonaConfig(config: PersonaConfig, ctx: ExtensionContext): void {
		if (config.tools?.length) {
			pi.setActiveTools(config.tools);
		} else if (baselineTools) {
			pi.setActiveTools(baselineTools);
		} else {
			pi.setActiveTools(getChatBaselineTools());
		}

		if (!ctx.hasUI) return;
		if (config.theme) {
			ctx.ui.setTheme(config.theme);
		} else if (baselineTheme) {
			ctx.ui.setTheme(baselineTheme);
		}
	}

	function persistPersona(): void {
		pi.appendEntry(PERSONAS_CUSTOM_TYPE, { persona: activePersona });
	}

	async function switchPersona(name: string, ctx: ExtensionCommandContext): Promise<void> {
		const hadSkills = previousPersonaHasSkills();
		activePersona = name;

		const persona = personas.get(name);
		if (persona) applyPersonaConfig(persona.config, ctx);
		const needsReload = !!persona?.config.skills?.length || hadSkills;
		if (needsReload) await ctx.reload();

		updateStatus(ctx);
		persistPersona();
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (getCurrentMode() !== "chat" || !activePersona) {
			ctx.ui.setStatus("chat-persona", undefined);
			return;
		}
		ctx.ui.setStatus("chat-persona", ctx.ui.theme.fg("muted", `persona: ${activePersona}`));
	}

	function clearStatus(ctx: ExtensionContext): void {
		if (ctx.hasUI) ctx.ui.setStatus("chat-persona", undefined);
	}

	function sessionStart(
		ctx: ExtensionContext,
		opts: { reason?: string; previousSessionFile?: string },
	): void {
		if (getCurrentMode() !== "chat") {
			baselineTools = null;
			baselineTheme = null;
			updateStatus(ctx);
			return;
		}

		captureBaseline(ctx);

		const cliPersona = normalizePersonaName(pi.getFlag("persona"));
		if (cliPersona) {
			if (personas.has(cliPersona)) {
				activePersona = cliPersona;
				const persona = personas.get(activePersona);
				if (persona) applyPersonaConfig(persona.config, ctx);
			} else if (ctx.hasUI) {
				ctx.ui.notify(`Unknown persona "${cliPersona}". Available: ${listNames()}.`, "error");
				if (activePersona) {
					const persona = personas.get(activePersona);
					if (persona) applyPersonaConfig(persona.config, ctx);
				}
			}
			updateStatus(ctx);
			return;
		}

		let restored = findLastSavedPersona(ctx.sessionManager.getEntries());
		if (!restored) {
			restored = findLastSavedPersona(ctx.sessionManager.getBranch());
		}
		let forkRestoredPersona = false;
		if (!restored && opts.reason === "fork" && opts.previousSessionFile) {
			restored = readLastPersonaFromSessionFile(opts.previousSessionFile);
			forkRestoredPersona = !!(restored && personas.has(restored));
		}

		if (restored && personas.has(restored)) {
			activePersona = restored;
			const persona = personas.get(activePersona);
			if (persona) applyPersonaConfig(persona.config, ctx);
			if (forkRestoredPersona) persistPersona();
		} else if (activePersona && personas.has(activePersona)) {
			const persona = personas.get(activePersona);
			if (persona) applyPersonaConfig(persona.config, ctx);
		}

		updateStatus(ctx);
	}

	function beforeAgentStart(basePrompt: string): string {
		if (getCurrentMode() !== "chat" || !activePersona) return basePrompt;
		const persona = personas.get(activePersona);
		if (!persona) return basePrompt;
		return composeSystemPrompt(basePrompt, activePersona, persona);
	}

	function extraSkillPaths(): string[] | undefined {
		if (getCurrentMode() !== "chat" || !activePersona) return undefined;
		const persona = personas.get(activePersona);
		if (!persona?.config.skills?.length) return undefined;
		return persona.config.skills.map((s) => (isAbsolute(s) ? s : join(chatAgentRoot, s)));
	}

	function registerPersonaCommand(): void {
		pi.registerFlag("persona", {
			description: "Select a chat persona from agents/chat/personas by name",
			type: "string",
			default: "",
		});

		if (isSubagent) return;

		pi.registerCommand("persona", {
			description: "Switch chat persona: /persona or /persona <name> (chat mode only)",
			handler: async (args, ctx: ExtensionCommandContext) => {
				if (getCurrentMode() !== "chat") {
					if (ctx.hasUI) ctx.ui.notify("Personas apply in chat mode only. Run /agent-mode chat first.", "warning");
					return;
				}

				captureBaseline(ctx);
				const name = normalizePersonaName(args);

				if (!name) {
					if (!ctx.hasUI) return;
					const names = [...personas.keys()].sort();
					const maxLen = Math.max(...names.map((n) => n.length), 7);
					const pad = (s: string) => s.padEnd(maxLen);

					const items = names.map((personaName) => {
						const persona = personas.get(personaName)!;
						const label = personaName === activePersona ? `${pad(personaName)} (active)` : pad(personaName);
						const bold = ctx.ui.theme.bold(label);
						const desc = persona.config.description ? `  ${ctx.ui.theme.fg("muted", persona.config.description)}` : "";
						return `${bold}${desc}`;
					});
					const selected = await ctx.ui.select("Select Persona", items);
					if (!selected) return;

					const idx = items.indexOf(selected);
					const picked = names[idx];
					if (!picked) return;
					await switchPersona(picked, ctx);
					if (ctx.hasUI) ctx.ui.notify(`Persona: ${picked}`, "info");
					return;
				}

				if (!personas.has(name)) {
					if (ctx.hasUI) ctx.ui.notify(`Unknown persona "${name}". Available: ${listNames()}.`, "error");
					return;
				}
				await switchPersona(name, ctx);
				if (ctx.hasUI) ctx.ui.notify(`Persona: ${name}`, "info");
			},
		});
	}

	return {
		personas,
		chatAgentRoot,
		sessionStart,
		beforeAgentStart,
		extraSkillPaths,
		registerPersonaCommand,
		updateStatus,
		clearStatus,
		persistPersona,
	};
}
