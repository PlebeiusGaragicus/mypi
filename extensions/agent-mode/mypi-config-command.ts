import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveConfigPath } from "../../shared/mypi-config/paths.js";

export function registerMypiConfig(pi: ExtensionAPI): void {
	pi.registerCommand("mypi-config", {
		description: "Show mypi user config path (TODO: this feature not yet implemented)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;

			const configPath = resolveConfigPath();
			ctx.ui.notify(`mypi config: ${configPath}`, "info");
		},
	});
}
