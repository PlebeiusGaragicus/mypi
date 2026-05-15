/**
 * Run finish notification — desktop + in-TUI when the agent finishes a turn.
 *
 * Platforms: macOS `osascript`, Linux `notify-send`, Windows PowerShell toast (only when
 * `WT_SESSION` is set), else Kitty OSC 99 or OSC 777 when stdout is a TTY. Skipped when
 * `process.stdout.isTTY` is false.
 *
 * On `agent_end`: `ctx.ui.notify` plus system notification; body reflects whether tools ran.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { exec } from "child_process";

/**
 * Send notification on macOS using AppleScript.
 */
function notifyMacOS(title: string, body: string): void {
	// Display a notification with a sound
	const script = `display notification "${body}" with title "${title}" sound name "Glass"`;
	exec(`osascript -e '${script}'`, () => {});
}

/**
 * Send notification on Linux using notify-send.
 */
function notifyLinux(title: string, body: string): void {
	exec(`notify-send "${title}" "${body}"`, () => {});
}

/**
 * Send Windows toast notification via PowerShell.
 */
function notifyWindows(title: string, body: string): void {
	if (!process.env.WT_SESSION) return;

	const script = [
		`$type = "Windows.UI.Notifications"`,
		`$mgr = [$type.ToastNotificationManager, $type, ContentType = WindowsRuntime]`,
		`$template = [$type.ToastTemplateType]::ToastText01`,
		`$xml = [$type.ToastNotificationManager]::GetTemplateContent($template)`,
		`$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
		`[$type.ToastNotificationManager]::CreateToastNotifier('${title}').Show([$type.ToastNotification]::new($xml))`,
	].join("; ");

	const { execFile } = require("child_process");
	execFile("powershell.exe", ["-NoProfile", "-Command", script]);
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
	} else if (process.platform === "win32") {
		notifyWindows(title, body);
		return;
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
	pi.on("agent_end", async (event, ctx) => {
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

		// Create notification message
		const notificationBody = hadToolCalls
			? "Run completed with tool calls"
			: "Run completed - ready for input";

		// Show in-app notification via TUI
		ctx.ui.notify("Pi Agent", "info");

		// Send system notification
		notify("Pi Agent", notificationBody);
	});
}
