import os from "node:os";
import path from "node:path";

/** @returns {string} Absolute path to mypi user config (default ~/.pi/mypi.json). */
export function resolveConfigPath() {
	const override = process.env.MYPI_CONFIG_FILE?.trim();
	if (override) return path.resolve(override);
	return path.join(os.homedir(), ".pi", "mypi.json");
}
