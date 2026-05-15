/**
 * Debug: show the full effective system prompt in a notification (no truncation).
 *
 * Default chord `ctrl+q` — change the first argument to `registerShortcut` if it
 * conflicts with your keybindings. No-op when `ctx.hasUI` is false.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerSystemView(pi: ExtensionAPI): void {
	pi.registerShortcut("ctrl+q", {
		description: "Debug: show full system prompt (notification)",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;
			ctx.ui.notify(ctx.getSystemPrompt(), "info");
		},
	});
}
