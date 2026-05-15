/**
 * Run finish notification — desktop when the agent finishes a turn.
 *
 * Platforms: macOS `osascript`, Linux `notify-send`, else Kitty OSC 99 or OSC 777 when stdout is a TTY. Skipped when
 * `process.stdout.isTTY` is false.
 *
 * On `agent_end`: system notification; body is a short preview of the last assistant text reply (or a fallback).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { exec } from "child_process";

const NOTIFY_PREVIEW_CHARS = 80;

/** Safe one-line snippet for OS notifications (shell / AppleScript / OSC). */
function sanitizeNotifyText(s: string): string {
	return s
		.replace(/\r?\n/g, " ")
		.replace(/;/g, ",")
		.replace(/"/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function truncateNotifyPreview(s: string, maxChars: number): string {
	const one = sanitizeNotifyText(s);
	if (one.length <= maxChars) return one;
	return `${one.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** Last assistant message: concatenate `text` parts only (skip thinking / tool calls). */
function lastAssistantReplyPreview(messages: { role: string; content?: unknown }[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
		const chunks: string[] = [];
		for (const part of msg.content) {
			if (
				part &&
				typeof part === "object" &&
				"type" in part &&
				(part as { type: string }).type === "text" &&
				"text" in part &&
				typeof (part as { text: unknown }).text === "string"
			) {
				chunks.push((part as { text: string }).text);
			}
		}
		const joined = chunks.join(" ").trim();
		if (joined.length > 0) return truncateNotifyPreview(joined, NOTIFY_PREVIEW_CHARS);
	}
	return "";
}

/**
 * Send notification on macOS using AppleScript.
 */
function notifyMacOS(title: string, body: string): void {
	// `sound name` = basename (no .aiff) from /System/Library/Sounds or ~/Library/Sounds.
	// System defaults: Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink.
	// Omit `sound name …` entirely for a silent notification.
	const script = `display notification "${body}" with title "${title}" sound name "Submarine"`;
	exec(`osascript -e '${script}'`, () => {});
}

/**
 * Send notification on Linux using notify-send.
 */
function notifyLinux(title: string, body: string): void {
	exec(`notify-send "${title}" "${body}"`, () => {});
}

/**
 * Send notification using OSC 777 escape sequence.
 * Supported by: Ghostty, iTerm2, WezTerm, rxvt-unicode
 */
function osc777Notification(title: string, body: string): void {
	process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

/**
 * Send notification using Kitty's OSC 99 sequence.
 */
function kittyNotification(title: string, body: string): void {
	process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
	process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

/**
 * Attempt platform-specific notification, fallback to terminal escape codes.
 */
function notify(title: string, body: string): void {
	// Try platform-specific methods first
	if (process.platform === "darwin") {
		try {
			notifyMacOS(title, body);
			return;
		} catch (e) {
			// Fall through to OSC method
		}
	} else if (process.platform === "linux") {
		try {
			notifyLinux(title, body);
			return;
		} catch (e) {
			// Fall through to OSC method
		}
	}

	// Fallback: Try terminal escape codes if stdout is a TTY
	if (process.stdout.isTTY) {
		if (process.env.KITTY_WINDOW_ID) {
			kittyNotification(title, body);
		} else {
			osc777Notification(title, body);
		}
	}
}

export default function (pi: ExtensionAPI) {
	/**
	 * Trigger notification when agent finishes processing a user prompt.
	 * The "agent_end" event fires after all tool calls are complete and
	 * the final assistant message has been processed.
	 */
	pi.on("agent_end", async (event, _ctx) => {
		if (!process.stdout.isTTY) return;

		// Determine if there were tool calls in this run
		const messages = event.messages;
		let hadToolCalls = false;

		for (const msg of messages) {
			if (msg.role === "assistant" && msg.content) {
				for (const part of msg.content) {
					if (part.type === "toolCall") {
						hadToolCalls = true;
						break;
					}
				}
			} else if (msg.role === "toolResult") {
				hadToolCalls = true;
			}

			if (hadToolCalls) break;
		}

		const preview = lastAssistantReplyPreview(messages);
		const notificationBody =
			preview ||
			(hadToolCalls ? "Run completed (tools only)" : "Run completed — ready for input");

		// Send system notification
		notify("Pi Agent", notificationBody);
	});
}
