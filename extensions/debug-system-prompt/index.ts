import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getActivePresetState } from "../../shared/presets/state";

/**
 * `--debug-system-prompt`: print the effective system prompt for the turn and
 * exit before calling the model.
 *
 * This must be the LAST entry in package.json's extension list:
 * before_agent_start handlers run in extension load order, each threading its
 * systemPrompt rewrite to the next, so printing from an earlier extension
 * would capture the prompt before preset composition and the workflow worker
 * catalog are applied.
 *
 * In-session UI: `/debug-system-prompt` and Ctrl+Q — see
 * `../mypi-branding/system-view.ts`.
 */
export default function debugSystemPrompt(pi: ExtensionAPI): void {
	pi.registerFlag("debug-system-prompt", {
		type: "boolean",
		default: false,
		description: "Print the effective system prompt for the turn and exit before calling the model",
	});

	pi.on("before_agent_start", async (event) => {
		const enabled = pi.getFlag("debug-system-prompt");
		if (enabled !== true && enabled !== "true") return undefined;

		const ev = event as { prompt: string; systemPrompt: string };
		process.stdout.write(
			`${JSON.stringify(
				{
					type: "debug_system_prompt",
					preset: getActivePresetState()?.name ?? null,
					prompt: ev.prompt,
					systemPrompt: ev.systemPrompt,
				},
				null,
				2,
			)}\n`,
		);
		process.exit(0);
	});
}
