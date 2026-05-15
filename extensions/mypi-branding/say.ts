/**
 * TTS — speaks assistant text with macOS `say` or Linux `espeak-ng`.
 *
 * - Auto TTS: off by default, or pass `--tts-enable` (e.g. in `pi-args`) for auto TTS on. On every
 *   `session_start` (startup, `/new`, `/resume`, etc.), auto TTS is re-read from that flag so it
 *   stays aligned with the agent’s CLI. `/tts-toggle` (on | off | empty to toggle) applies until
 *   the next `session_start`, when the CLI default wins again.
 * - Streaming: when auto TTS is on, text is split on NEWLINES only (not sentence punctuation) and
 *   each line is queued and spoken as soon as it arrives during assistant streaming. This keeps
 *   multi-sentence paragraphs gap-free (one `say`/`espeak-ng` call per paragraph) while still
 *   starting speech before the full reply is generated. Bullet items, table rows, and paragraph
 *   breaks still get a gap between them because each is its own line in the source text.
 * - Manual: `/say` speaks the last assistant reply in the session; `/stop-speaking` halts it.
 * - Replaces URLs with "URL redacted"; strips Markdown `*`, `#`, blockquote `>` prefixes, and
 *   Unicode box-drawing / tree characters so the synthesizer does not read them aloud.
 * - Fenced code blocks (```) are omitted from speech entirely; exception: ```txt and ```markdown
 *   fences have their content spoken (fence lines themselves are always omitted).
 * - Only runs when `ctx.hasUI` (interactive TUI) and a TTS backend is available.
 * - Speech rate: per-device WPM stored in `~/.pi/tts-wpm` (default 250). Adjust with `/tts-wpm`.
 * - A new user prompt, `/stop-speaking`, `/tts-toggle off`, or pi exiting all cancel speech.
 *
 * Platform backends are selected inline. Currently: macOS `say`, Linux `espeak-ng`.
 *
 * Common-bundle note: kept as one file so pi’s loader resolves cleanly through symlinked agent
 * `extensions/` trees. Linux needs `espeak-ng` on PATH (`apt install espeak-ng` on Debian/Ubuntu).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface TtsBackend {
	name: string;
	spawn(text: string, rateWpm: number, paused: boolean): ChildProcess;
}

function spawnTtsChild(bin: string, args: string[], text: string, paused: boolean): ChildProcess {
	const child = spawn(bin, args, {
		stdio: ["pipe", "ignore", "inherit"],
	});
	try {
		child.stdin?.end(text);
	} catch {
		/* child may have died before we could write */
	}
	if (paused) {
		try {
			child.kill("SIGSTOP");
		} catch {
			/* ignore */
		}
	}
	return child;
}

function resolveBackend(): TtsBackend | null {
	if (process.platform === "darwin") {
		return {
			name: "macos-say",
			spawn: (text, rateWpm, paused) => spawnTtsChild("say", ["-r", String(rateWpm), "-f", "-"], text, paused),
		};
	}
	if (process.platform === "linux") {
		try {
			if (spawnSync("which", ["espeak-ng"], { stdio: "ignore" }).status === 0) {
				return {
					name: "linux-espeak-ng",
					spawn: (text, rateWpm, paused) => spawnTtsChild("espeak-ng", ["-s", String(rateWpm), "--stdin"], text, paused),
				};
			}
		} catch {
			/* espeak-ng not available */
		}
	}
	return null;
}

const backend = resolveBackend();

const URL_REDACTED = "URL redacted";
const MAX_CHARS = 32_000;
const DEFAULT_WPM = 250;

/** Plain Pi user config file (not tied to DOT_PI_OVERLAY / dot-pi). */
function ttsWpmPath(): string {
	return path.join(os.homedir(), ".pi", "tts-wpm");
}

function loadWpm(): number {
	try {
		const wpmPath = ttsWpmPath();
		if (!fs.existsSync(wpmPath)) return DEFAULT_WPM;
		const val = parseInt(fs.readFileSync(wpmPath, "utf-8").trim(), 10);
		return Number.isFinite(val) && val > 0 ? val : DEFAULT_WPM;
	} catch {
		return DEFAULT_WPM;
	}
}

function saveWpm(wpm: number): void {
	try {
		const file = ttsWpmPath();
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, String(wpm) + "\n", "utf-8");
	} catch {
		/* ignore — root dir may not be writable */
	}
}

/** Words per minute; loaded from ~/.pi/tts-wpm on session_start, adjustable via /tts-wpm */
let currentWpm = DEFAULT_WPM;

/** In-memory; synced from `--tts-enable` on every session_start; `/tts-toggle` until next session_start */
let autoTtsEnabled = false;

/** Currently-speaking `say` child, or null. Only one plays at a time. */
let currentSay: ChildProcess | null = null;
/** Pre-warmed next `say` child, started while `currentSay` is playing so the next sentence
 *  does not pay a full fork/exec/voice-load on transition. Audio overlap is prevented by
 *  keeping it SIGSTOPped until the current child exits. */
let pendingSay: { child: ChildProcess } | null = null;
const speechQueue: string[] = [];

/** Per-contentIndex buffers of streamed text not yet terminated by a newline */
const pendingByIndex = new Map<number, string>();
/** Per-contentIndex fence state for streaming code-block detection */
const fenceModeByIndex = new Map<number, FenceMode>();
/** Set when streaming has already produced at least one spoken line for the current
 *  turn so the `agent_end` fallback does not re-speak the whole reply. */
let streamedThisTurn = false;
/** True once exit/signal handlers have been installed (only once per process). */
let exitHandlersInstalled = false;

function killChild(c: ChildProcess | null | undefined): void {
	if (!c) return;
	try {
		c.kill("SIGKILL");
	} catch {
		/* ignore — process may already be dead */
	}
}

function stopSay(): void {
	const cur = currentSay;
	currentSay = null;
	const pen = pendingSay;
	pendingSay = null;
	// Resume the pending child before killing so SIGKILL actually delivers (SIGSTOPped
	// processes queue signals but our SIGKILL should go through regardless; doing the
	// SIGCONT first is belt-and-suspenders).
	if (pen) {
		try {
			pen.child.kill("SIGCONT");
		} catch {
			/* ignore */
		}
		killChild(pen.child);
	}
	killChild(cur);
}

function resetSpeechState(): void {
	speechQueue.length = 0;
	pendingByIndex.clear();
	fenceModeByIndex.clear();
	streamedThisTurn = false;
	stopSay();
}

/** Matches an opening or closing ``` fence line. Group 1 captures the language token (if any). */
const FENCE_OPEN_RE = /^\s*```(\S*)\s*$/;
const FENCE_CLOSE_RE = /^\s*```\s*$/;
const SPOKEN_FENCE_LANGS = new Set(["txt", "markdown"]);

type FenceMode = "normal" | "skip" | "keep";

const CODE_BLOCK_SKIPPED = "Code block skipped.";

/** Classify a line against the current fence state and return the next state,
 *  whether to emit, and an optional replacement line (e.g. "Code block skipped."). */
function updateFenceState(mode: FenceMode, line: string): { next: FenceMode; emit: boolean; replace?: string } {
	if (mode === "normal") {
		const m = FENCE_OPEN_RE.exec(line);
		if (m) {
			const lang = (m[1] ?? "").toLowerCase();
			if (SPOKEN_FENCE_LANGS.has(lang)) return { next: "keep", emit: false };
			return { next: "skip", emit: true, replace: CODE_BLOCK_SKIPPED };
		}
		return { next: "normal", emit: true };
	}
	// Inside a fence (skip or keep): closing fence ends the block
	if (FENCE_CLOSE_RE.test(line)) return { next: "normal", emit: false };
	return { next: mode, emit: mode === "keep" };
}

/** Remove fenced code blocks from full text, preserving `txt` and `markdown` fence content. */
function removeSkippedFencedCodeBlocks(text: string): string {
	const lines = text.split("\n");
	const out: string[] = [];
	let mode: FenceMode = "normal";
	for (const line of lines) {
		const { next, emit, replace } = updateFenceState(mode, line);
		mode = next;
		if (emit) out.push(replace ?? line);
	}
	return out.join("\n");
}

/** http(s) URLs and bare www.… tokens */
function redactUrlsForSpeech(text: string): string {
	let s = text.replace(/https?:\/\/\S+/gi, URL_REDACTED);
	s = s.replace(/\bwww\.\S+/gi, URL_REDACTED);
	return s.replace(/[^\S\n]+/g, " ").trim();
}

/** Remove Markdown markers, blockquote prefixes, and box-drawing chars the synthesizer would speak */
function stripMarkdownForSpeech(text: string): string {
	let s = text;
	// Strip blockquote `>` prefixes (supports nested `> > `)
	s = s.replace(/^(?:>\s*)+/gm, "");
	// Strip box-drawing (U+2500–U+257F) and block-element (U+2580–U+259F) characters
	s = s.replace(/[\u2500-\u257F\u2580-\u259F]/g, "");
	// Strip Markdown emphasis/heading markers
	s = s.replace(/[*#]/g, "");
	return s.replace(/[^\S\n]+/g, " ").trim();
}

type ContentPart = { type: string; text?: string };

function assistantToSpeechText(msg: Record<string, unknown>): string | null {
	if (msg.role !== "assistant" || !Array.isArray(msg.content)) return null;

	const sr = msg.stopReason;
	if (sr === "error" || sr === "aborted") return null;

	const chunks: string[] = [];
	for (const part of msg.content as ContentPart[]) {
		if (part.type === "text" && typeof part.text === "string") chunks.push(part.text);
	}
	const raw = removeSkippedFencedCodeBlocks(chunks.join(""));
	const cleaned = stripMarkdownForSpeech(redactUrlsForSpeech(raw));
	if (cleaned.length === 0) return null;
	return cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) : cleaned;
}

function getLastAssistantSpeechText(messages: unknown[]): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const text = assistantToSpeechText(messages[i] as Record<string, unknown>);
		if (text !== null) return text;
	}
	return null;
}

function getLastAssistantSpeechTextFromSession(entries: unknown[]): string | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as { type?: string; message?: unknown };
		if (e.type !== "message" || e.message === undefined) continue;
		const text = assistantToSpeechText(e.message as Record<string, unknown>);
		if (text !== null) return text;
	}
	return null;
}

/** Split a buffer into complete lines + the remainder. Boundaries are one or more
 *  consecutive newlines; empty lines are dropped. Splitting on newlines (rather than
 *  sentence punctuation) lets a whole paragraph play as one `say` invocation, which is
 *  gap-free internally — the only remaining gaps are where the source text itself has
 *  a line break (bullet items, table rows, paragraph breaks). The trailing remainder
 *  (everything after the last newline) is buffered until either another newline arrives
 *  or `text_end`/`message_end`/`agent_end` flushes it. */
const LINE_END = /\n+/g;
function extractLines(buf: string): { lines: string[]; rest: string } {
	const lines: string[] = [];
	let last = 0;
	LINE_END.lastIndex = 0;
	let m: RegExpExecArray | null = LINE_END.exec(buf);
	while (m !== null) {
		const end = m.index + m[0].length;
		const chunk = buf.slice(last, end).trim();
		if (chunk.length > 0) lines.push(chunk);
		last = end;
		m = LINE_END.exec(buf);
	}
	return { lines, rest: buf.slice(last) };
}

function startSpeaking(text: string): void {
	// Reuse the pre-warmed child if its text matches what we intend to speak next.
	if (pendingSay) {
		const pen = pendingSay.child;
		pendingSay = null;
		currentSay = pen;
		const clear = (): void => {
			if (currentSay === pen) currentSay = null;
			onSayFinished();
		};
		pen.on("exit", clear);
		pen.on("error", clear);
		try {
			pen.kill("SIGCONT");
		} catch {
			/* ignore */
		}
	} else {
		const child = backend!.spawn(text, currentWpm, false);
		currentSay = child;
		const clear = (): void => {
			if (currentSay === child) currentSay = null;
			onSayFinished();
		};
		child.on("exit", clear);
		child.on("error", clear);
	}
	// Pre-warm the next queued sentence while this one plays.
	prewarmNext();
}

function prewarmNext(): void {
	if (pendingSay) return;
	if (backend === null || !autoTtsEnabled) return;
	const next = speechQueue[0];
	if (next === undefined) return;
	const child = backend!.spawn(next, currentWpm, true);
	pendingSay = { child };
	// If the pre-warmed child dies unexpectedly (e.g. SIGKILL from stopSay during a
	// reset), clear the slot so we don't try to SIGCONT a zombie later.
	const clearIfSelf = (): void => {
		if (pendingSay && pendingSay.child === child) pendingSay = null;
	};
	child.on("exit", clearIfSelf);
	child.on("error", clearIfSelf);
}

/** Called when a `say` child exits. Always drains the queue — items were enqueued
 *  intentionally (by streaming or `/say`) and must play out. The `autoTtsEnabled`
 *  gate is enforced at *enqueue* time (`enqueueSpeech`), not at dequeue time, so
 *  `/say` works even when auto TTS is off and toggling TTS off mid-stream still
 *  works because `resetSpeechState` clears the queue explicitly. */
function onSayFinished(): void {
	const next = speechQueue.shift();
	if (next === undefined) return;
	startSpeaking(next);
}

/** Enqueue `text` for speech. Returns `true` iff text was non-empty after cleaning and
 *  actually made it into the speech pipeline (spawned or queued). Callers use the
 *  return value to decide whether streaming has produced audible output this turn. */
function enqueueSpeech(text: string): boolean {
	const cleaned = stripMarkdownForSpeech(redactUrlsForSpeech(text));
	if (!cleaned) return false;
	const capped = cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) : cleaned;

	if (backend === null || !autoTtsEnabled) return false;

	if (currentSay === null) {
		// Nothing playing: speak immediately and start pre-warming from the queue head
		// (which is still empty, but `startSpeaking` calls `prewarmNext` which is a
		// no-op when the queue is empty — the next `enqueueSpeech` below pre-warms).
		startSpeaking(capped);
	} else {
		speechQueue.push(capped);
		// If no pre-warm is in flight yet, kick one off for the sentence we just queued.
		prewarmNext();
	}
	return true;
}

/** Speak a full block of text by splitting into lines and enqueueing each.
 *  Used by the manual `/say` command and the `agent_end` fallback. */
function speakBlock(text: string): boolean {
	let any = false;
	const { lines, rest } = extractLines(text);
	for (const line of lines) any = enqueueSpeech(line) || any;
	if (rest.trim()) any = enqueueSpeech(rest) || any;
	return any;
}

function installExitHandlers(): void {
	if (exitHandlersInstalled) return;
	exitHandlersInstalled = true;

	const killOnExit = (): void => {
		// Resume any SIGSTOPped pending child so our SIGKILL definitely takes it down.
		if (pendingSay) {
			try {
				pendingSay.child.kill("SIGCONT");
			} catch {
				/* ignore */
			}
			killChild(pendingSay.child);
			pendingSay = null;
		}
		killChild(currentSay);
		currentSay = null;
	};

	process.once("exit", killOnExit);
	for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.once(sig, () => {
			killOnExit();
		});
	}
}

export default function (pi: ExtensionAPI) {
	installExitHandlers();

	pi.registerFlag("tts-enable", {
		type: "boolean",
		default: false,
		description: "Enable automatic TTS after each assistant reply (macOS say / Linux espeak-ng)",
	});

	pi.on("session_start", async () => {
		autoTtsEnabled = pi.getFlag("tts-enable") === true;
		currentWpm = loadWpm();
		const wpmPath = ttsWpmPath();
		if (!fs.existsSync(wpmPath)) saveWpm(DEFAULT_WPM);
	});

	pi.on("before_agent_start", async () => {
		resetSpeechState();
	});

	pi.on("message_update", async (event) => {
		if (backend === null || !autoTtsEnabled) return;
		const e = event.assistantMessageEvent;
		if (e.type === "text_delta") {
			const prev = pendingByIndex.get(e.contentIndex) ?? "";
			const { lines, rest } = extractLines(prev + e.delta);
			pendingByIndex.set(e.contentIndex, rest);
			for (const line of lines) {
				const mode = fenceModeByIndex.get(e.contentIndex) ?? "normal";
				const { next, emit, replace } = updateFenceState(mode, line);
				fenceModeByIndex.set(e.contentIndex, next);
				if (emit && enqueueSpeech(replace ?? line)) streamedThisTurn = true;
			}
		} else if (e.type === "text_end") {
			const tail = pendingByIndex.get(e.contentIndex) ?? "";
			const mode = fenceModeByIndex.get(e.contentIndex) ?? "normal";
			pendingByIndex.delete(e.contentIndex);
			fenceModeByIndex.delete(e.contentIndex);
			if (tail.trim() && mode !== "skip" && enqueueSpeech(tail)) streamedThisTurn = true;
		}
	});

	pi.on("message_end", async (event) => {
		const msg = event.message as unknown as Record<string, unknown> | undefined;
		const sr = msg?.stopReason;
		if (sr === "error" || sr === "aborted") {
			resetSpeechState();
			return;
		}
		for (const [idx, tail] of pendingByIndex) {
			const mode = fenceModeByIndex.get(idx) ?? "normal";
			if (tail.trim() && mode !== "skip" && enqueueSpeech(tail)) streamedThisTurn = true;
			pendingByIndex.delete(idx);
			fenceModeByIndex.delete(idx);
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		if (backend === null || !ctx.hasUI || !autoTtsEnabled) {
			streamedThisTurn = false;
			return;
		}
		if (streamedThisTurn) {
			streamedThisTurn = false;
			return;
		}

		const text = getLastAssistantSpeechText(event.messages);
		if (text === null) return;
		speakBlock(text);
	});

	pi.on("session_shutdown", async () => {
		resetSpeechState();
	});

	pi.registerCommand("tts-toggle", {
		description: "Toggle or set auto TTS after each reply (on | off | empty to toggle)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;

			const a = args.trim().toLowerCase();

			if (a === "") {
				autoTtsEnabled = !autoTtsEnabled;
			} else if (a === "on") {
				autoTtsEnabled = true;
			} else if (a === "off") {
				autoTtsEnabled = false;
			} else {
				ctx.ui.notify('Usage: /tts-toggle [on|off] — omit args to toggle', "warning");
				return;
			}

			if (!autoTtsEnabled) resetSpeechState();

			ctx.ui.notify(`Auto TTS: ${autoTtsEnabled ? "on" : "off"}`, "info");
		},
	});

	pi.registerCommand("say", {
		description: "Speak the last assistant reply",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			if (backend === null) {
				ctx.ui.notify(
					process.platform === "linux"
						? "TTS unavailable — install espeak-ng (apt install espeak-ng)"
						: "TTS is not available on this platform",
					"warning",
				);
				return;
			}

			const text = getLastAssistantSpeechTextFromSession(ctx.sessionManager.getEntries() as unknown[]);
			if (text === null) {
				ctx.ui.notify("No assistant message to speak yet", "info");
				return;
			}

			// Manual replay: stop anything in flight, then enqueue. Temporarily enable
			// autoTtsEnabled so enqueueSpeech accepts the text (it gates on this flag).
			// We leave it enabled — onSayFinished drains the queue regardless, and the
			// next session_start or /tts-toggle will reset it to the CLI default.
			resetSpeechState();
			autoTtsEnabled = true;
			speakBlock(text);
		},
	});

	pi.registerCommand("stop-speaking", {
		description: "Stop any in-flight TTS speech and clear the queue",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			const hadSomething = currentSay !== null || pendingSay !== null || speechQueue.length > 0;
			resetSpeechState();
			ctx.ui.notify(hadSomething ? "Stopped speaking" : "Nothing to stop", "info");
		},
	});

	pi.registerCommand("tts-wpm", {
		description: "Get or set TTS words-per-minute (persists to ~/.pi/tts-wpm)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			const a = args.trim();
			if (!a) {
				ctx.ui.notify(`TTS speed: ${currentWpm} WPM`, "info");
				return;
			}
			const val = parseInt(a, 10);
			if (!Number.isFinite(val) || val < 50 || val > 600) {
				ctx.ui.notify("Usage: /tts-wpm [50-600]", "warning");
				return;
			}
			currentWpm = val;
			saveWpm(val);
			ctx.ui.notify(`TTS speed set to ${val} WPM`, "info");
		},
	});
}
