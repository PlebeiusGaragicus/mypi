/**
 * Sets process.env.B to the compiled browser-control CLI when present.
 * Pi bash inherits via getShellEnv().
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROWSE_BIN = join(PACKAGE_ROOT, "utilities", "browser-runtime", "dist", "browse");

function bootstrapBrowseBinary(): void {
	if (process.env.B) return;
	if (!existsSync(BROWSE_BIN)) return;
	process.env.B = BROWSE_BIN;
}

bootstrapBrowseBinary();

export default function (_pi: ExtensionAPI) {}
