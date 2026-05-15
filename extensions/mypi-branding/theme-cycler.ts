import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const SKIP_THEME_NAMES = new Set(["dark", "light"]);

function isCycledTheme(name: string): boolean {
	return !SKIP_THEME_NAMES.has(name.trim().toLowerCase());
}

/**
 * One-shot theme cycling (`ctrl+option+r` — adjust the registered chord if it clashes with your keymap).
 * Skips built-in **dark** and **light** by name (case-insensitive). No swatches or slash command — notifies the new theme name.
 */
function cycleThemeForward(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;

	const all = ctx.ui.getAllThemes();
	const themes = all.filter((t) => isCycledTheme(t.name));
	if (themes.length === 0) {
		ctx.ui.notify("No themes to cycle (only dark/light)", "warning");
		return;
	}

	let index = themes.findIndex((t) => t.name === ctx.ui.theme.name);
	if (index === -1) index = -1;

	index = (index + 1) % themes.length;
	const next = themes[index]!;
	const result = ctx.ui.setTheme(next.name);
	if (result.success) {
		ctx.ui.notify(next.name, "info");
	} else {
		ctx.ui.notify(result.error ?? "Failed to set theme", "error");
	}
}

export function registerThemeCycler(pi: ExtensionAPI): void {
	pi.registerShortcut("ctrl+option+r", {
		description: "Cycle to the next theme",
		handler: async (ctx) => {
			cycleThemeForward(ctx);
		},
	});
}
