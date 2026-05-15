/**
 * Save — `/save` writes the last assistant reply to a markdown file.
 *
 * Prompts for filename (appends `.md`), then directory: cwd, `~/Downloads`, or `~/`.
 * Gated on `ctx.hasUI`. No hooks.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type ContentPart = { type: string; text?: string };

function getLastAssistantText(entries: unknown[]): string | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as { type?: string; message?: Record<string, unknown> };
		if (e.type !== "message" || !e.message) continue;

		const msg = e.message;
		if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;

		const sr = msg.stopReason;
		if (sr === "aborted" && (msg.content as ContentPart[]).length === 0) continue;

		const chunks: string[] = [];
		for (const part of msg.content as ContentPart[]) {
			if (part.type === "text" && typeof part.text === "string") chunks.push(part.text);
		}
		const text = chunks.join("").trim();
		if (text.length > 0) return text;
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("save", {
		description: "Save the last assistant reply as a markdown file",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;

			const entries = ctx.sessionManager.getEntries() as unknown[];
			const text = getLastAssistantText(entries);
			if (!text) {
				ctx.ui.notify("No assistant message to save", "warning");
				return;
			}

			const abort = () => ctx.ui.notify("Save aborted", "info");

			let filename = await ctx.ui.input("Filename (.md added if missing)");
			if (!filename || !filename.trim()) { abort(); return; }
			filename = filename.trim();
			if (!filename.endsWith(".md")) filename += ".md";

			const cwd = ctx.cwd;
			const home = os.homedir();
			const downloads = path.join(home, "Downloads");

			const choices: string[] = [`Current directory (${cwd})`];
			if (path.resolve(cwd) !== path.resolve(downloads)) choices.push("~/Downloads/");
			if (path.resolve(cwd) !== path.resolve(home)) choices.push(`~/ (${home})`);

			const selected = await ctx.ui.select("Save to", choices);
			if (!selected) { abort(); return; }

			let dir: string;
			if (selected.startsWith("~/Downloads")) dir = downloads;
			else if (selected.startsWith("~/")) dir = home;
			else dir = cwd;

			const fullPath = path.join(dir, filename);

			while (fs.existsSync(fullPath)) {
				const action = await ctx.ui.select(
					`${fullPath} already exists`,
					["I'm going too fast...", "No", "Yes, overwrite"],
				);
				if (action === "Yes, overwrite") break;
				if (action !== "I'm going too fast...") { abort(); return; }
			}

			try {
				fs.writeFileSync(fullPath, text, "utf-8");
				ctx.ui.notify(`Saved to ${fullPath}`, "info");
			} catch (err) {
				ctx.ui.notify(`Failed to save: ${err instanceof Error ? err.message : String(err)}`, "error");
			}
		},
	});
}
