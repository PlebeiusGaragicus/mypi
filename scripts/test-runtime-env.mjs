#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	applyRuntimeEnv,
	ensureRuntimeEnvFile,
	formatShellExports,
	parseRuntimeEnv,
	readRuntimeEnv,
	resolveRuntimeEnvPath,
	writeRuntimeEnv,
} from "../shared/runtime-env/index.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mypi-runtime-env-"));
process.env.MYPI_ENV_FILE = path.join(tmp, "mypi.env");

assert.equal(resolveRuntimeEnvPath(), process.env.MYPI_ENV_FILE);
assert.equal(fs.existsSync(process.env.MYPI_ENV_FILE), false);
ensureRuntimeEnvFile();
assert.equal(fs.existsSync(process.env.MYPI_ENV_FILE), true);

const initial = readRuntimeEnv();
assert.equal(initial.EXA_API_KEY, "");
assert.equal(initial.SAY_TTS_WPM, "300");

writeRuntimeEnv({
	...initial,
	EXA_API_KEY: "",
	TAVILY_API_KEY: "tavily-test",
	SAY_TTS_WPM: "250",
});

const target = { TAVILY_API_KEY: "" };
applyRuntimeEnv(target);
assert.equal(target.TAVILY_API_KEY, "tavily-test");
assert.equal(target.SAY_TTS_WPM, "250");
assert.equal(target.EXA_API_KEY, undefined);

assert.deepEqual(parseRuntimeEnv('A=1\nB="two words"\n# C=3\nexport D=4\n'), {
	A: "1",
	B: "two words",
	D: "4",
});

const exports = formatShellExports({ A: "1", B: "", C: "3" }, { C: "already" }, "/bin/zsh");
assert.equal(exports, "export A='1'\n");

console.log("Runtime env tests passed.");
