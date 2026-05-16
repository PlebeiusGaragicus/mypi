/**
 * Legacy ANSI fallback: some terminals (notably Apple Terminal.app) mis-parse
 * or garble 24-bit foreground SGR (`38;2;r;g;b`), producing wrong colors
 * (GitHub issue #3). We fall back to xterm 256-color (`38;5;n`) when needed.
 *
 * Sunset (~2028+): Revisit deleting this module once legacy macOS / Intel /
 * Terminal combinations are rare enough that maintaining the heuristics is
 * not worth a few KiB and the Terminal.app session heuristics (`TERM_PROGRAM` /
 * `__CFBundleIdentifier`).
 *
 * Precedence for 24-bit vs 256 (`brandingUseTruecolor`):
 * - `MYPI_BRANDING_TRUECOLOR=0` → 256 only
 * - `MYPI_BRANDING_TRUECOLOR=1` → 24-bit (override blocklist / depth)
 * - **Intel Mac + Terminal.app** (`darwin` + `os.arch() === "x64"` + `isAppleTerminalLikeSession`) → 256
 * - TTY `getColorDepth() < 24` → 256 (any OS; not tied to Terminal.app)
 * - else → 24-bit
 *
 * `brandingFgRgb`: if `NO_COLOR` is set (non-empty), emit no color prefix (spec).
 */

import { arch } from "node:os";

function ttyStreamForDepth(): NodeJS.WriteStream {
	if (process.stdout.isTTY) return process.stdout;
	if (process.stderr.isTTY) return process.stderr;
	return process.stdout;
}

/** True when the process is almost certainly under Terminal.app (no env to set). */
function isAppleTerminalLikeSession(): boolean {
	if (process.env.TERM_PROGRAM === "Apple_Terminal") return true;
	// Some wrappers omit TERM_PROGRAM; macOS GUI sessions often still set bundle id.
	if (process.env.__CFBundleIdentifier === "com.apple.Terminal") return true;
	return false;
}

/** Terminal.app truecolor workaround: Intel macOS only (not Linux x64, not Apple Silicon). */
function shouldForceLegacyForAppleTerminal(): boolean {
	if (process.platform !== "darwin") return false;
	if (arch() !== "x64") return false;
	return isAppleTerminalLikeSession();
}

function computeBrandingUseTruecolor(): boolean {
	if (process.env.MYPI_BRANDING_TRUECOLOR === "0") return false;
	if (process.env.MYPI_BRANDING_TRUECOLOR === "1") return true;
	if (shouldForceLegacyForAppleTerminal()) return false;
	const stream = ttyStreamForDepth();
	const depth =
		typeof stream.getColorDepth === "function" ? stream.getColorDepth() : 1;
	return depth >= 24;
}

const brandingUseTruecolorCached = computeBrandingUseTruecolor();

/** Whether session branding should emit 24-bit (`38;2`) vs 256-color (`38;5`). */
export function brandingUseTruecolor(): boolean {
	return brandingUseTruecolorCached;
}

/** Map RGB to xterm 256 palette index (16 + 36×R + 6×G + B cube, grey ramp). */
function rgbToAnsi256(r: number, g: number, b: number): number {
	if (r === g && g === b) {
		if (r < 8) return 16;
		if (r > 248) return 231;
		return Math.round(((r - 8) / 247) * 24) + 232;
	}
	return (
		16 +
		36 * Math.round((r / 255) * 5) +
		6 * Math.round((g / 255) * 5) +
		Math.round((b / 255) * 5)
	);
}

/** Opening SGR for foreground RGB, or empty string when `NO_COLOR` is active. */
export function brandingFgRgb(rgb: readonly [number, number, number]): string {
	const noColor = process.env.NO_COLOR;
	if (noColor !== undefined && noColor !== "") return "";
	const [r, g, b] = rgb;
	if (brandingUseTruecolorCached) return `\x1b[38;2;${r};${g};${b}m`;
	return `\x1b[38;5;${rgbToAnsi256(r, g, b)}m`;
}
