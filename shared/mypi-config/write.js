import fs from "node:fs";
import { resolveConfigPath } from "./paths.js";

/** @param {import('./read.js').MypiConfig} config */
export function writeConfig(config) {
	const configPath = resolveConfigPath();
	const payload = {
		tts: config.tts ?? {},
		env: config.env ?? {},
	};
	const body = JSON.stringify(payload, null, 2) + "\n";
	const tmp = `${configPath}.tmp.${process.pid}`;
	fs.writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
	fs.renameSync(tmp, configPath);
	try {
		fs.chmodSync(configPath, 0o600);
	} catch {
		/* ignore if platform does not support */
	}
}
