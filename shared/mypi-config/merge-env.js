import { readConfig } from "./read.js";

/**
 * Merge non-empty env values from mypi.json into target for keys not already set.
 * @param {NodeJS.ProcessEnv} [target=process.env]
 */
export function applyConfigEnv(target = process.env) {
	const config = readConfig();
	for (const [key, value] of Object.entries(config.env ?? {})) {
		if (!value) continue;
		const existing = target[key];
		if (existing !== undefined && existing !== "") continue;
		target[key] = value;
	}
}
