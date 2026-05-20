#!/usr/bin/env node
import { formatShellExports, resolveRuntimeEnvPath } from "./index.js";

if (process.argv.includes("--path-only")) {
	process.stdout.write(resolveRuntimeEnvPath() + "\n");
} else {
	process.stdout.write(formatShellExports());
}
