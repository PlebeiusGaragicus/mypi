/**
 * Debug: show the full effective system prompt in a notification (no truncation).
 *
 * After at least one persisted **user** or **assistant** message on the current leaf,
 * `ctrl+q` shows the **last applied** system prompt (post–`before_agent_start`). Before
 * that, Pi has not built the turn prompt yet — we show a short notice instead of the
 * misleading default template.
 *
 * Default chord `ctrl+q` — change the first argument to `registerShortcut` if it
 * conflicts with your keybindings. No-op when `ctx.hasUI` is false.
 */

import type { ExtensionAPI, ExtensionContext, SessionMessageEntry } from "@earendil-works/pi-coding-agent";

function hasPersistedConversationOnLeaf(ctx: ExtensionContext): boolean {
	for (const e of ctx.sessionManager.getBranch()) {
		if (e.type !== "message") continue;
		const role = (e as SessionMessageEntry).message.role;
		if (role === "user" || role === "assistant") return true;
	}
	return false;
}

export function registerSystemView(pi: ExtensionAPI): void {
	pi.registerShortcut("ctrl+q", {
		description: "Debug: show full system prompt (notification)",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;
			if (!hasPersistedConversationOnLeaf(ctx)) {
				ctx.ui.notify("No turns yet — system prompt is not built until you send a message.", "info");
				return;
			}
			ctx.ui.notify(ctx.getSystemPrompt(), "info");
		},
	});
}
