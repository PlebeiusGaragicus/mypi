import { readConfig } from "./read.js";
import { writeConfig } from "./write.js";

/**
 * @param {string} name
 * @param {string} [defaultValue=""]
 * @returns {string}
 */
export function ensureEnvKey(name, defaultValue = "") {
	const config = readConfig();
	if (!config.env) config.env = {};
	if (Object.hasOwn(config.env, name)) {
		return config.env[name];
	}
	config.env[name] = defaultValue;
	writeConfig(config);
	return defaultValue;
}

/**
 * @param {number} [defaultWpm=300]
 * @returns {number}
 */
export function ensureTtsWpm(defaultWpm = 300) {
	const config = readConfig();
	if (!config.tts) config.tts = {};
	if (typeof config.tts.wpm === "number" && Number.isFinite(config.tts.wpm) && config.tts.wpm > 0) {
		return config.tts.wpm;
	}
	config.tts.wpm = defaultWpm;
	writeConfig(config);
	return defaultWpm;
}

/**
 * @param {number} wpm
 */
export function setTtsWpm(wpm) {
	const config = readConfig();
	if (!config.tts) config.tts = {};
	config.tts.wpm = wpm;
	writeConfig(config);
}
