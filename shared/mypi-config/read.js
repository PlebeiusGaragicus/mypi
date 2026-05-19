import fs from "node:fs";
import { resolveConfigPath } from "./paths.js";

/** @typedef {{ wpm?: number }} TtsConfig */
/** @typedef {{ tts?: TtsConfig, env?: Record<string, string> }} MypiConfig */

/** @returns {MypiConfig} */
export function readConfig() {
	const configPath = resolveConfigPath();
	if (!fs.existsSync(configPath)) {
		return { tts: {}, env: {} };
	}
	try {
		const raw = fs.readFileSync(configPath, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") {
			return { tts: {}, env: {} };
		}
		const env =
			parsed.env && typeof parsed.env === "object" && !Array.isArray(parsed.env)
				? Object.fromEntries(
						Object.entries(parsed.env).filter(([, v]) => typeof v === "string"),
					)
				: {};
		const tts =
			parsed.tts && typeof parsed.tts === "object" && !Array.isArray(parsed.tts)
				? { ...parsed.tts }
				: {};
		return { tts, env };
	} catch {
		return { tts: {}, env: {} };
	}
}
