// Task libraries for the workflow bench: evals/tasks/<name>.txt, one task
// per line, `#` lines are section headers, blank lines ignored.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export function listTaskLibraries(evalsDir) {
	const tasksDir = path.join(evalsDir, "tasks");
	if (!existsSync(tasksDir)) return [];
	return readdirSync(tasksDir)
		.filter((name) => name.endsWith(".txt"))
		.map((name) => name.slice(0, -4))
		.sort();
}

export function loadTasks(evalsDir, name) {
	const tasksPath = path.join(evalsDir, "tasks", `${name}.txt`);
	if (!existsSync(tasksPath)) throw new Error(`no task library: ${tasksPath}`);
	const tasks = [];
	let section = "";
	for (const line of readFileSync(tasksPath, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("#")) {
			section = trimmed.replace(/^#+\s*/, "");
			continue;
		}
		tasks.push({ number: tasks.length + 1, section, text: trimmed });
	}
	if (!tasks.length) throw new Error(`${tasksPath} contains no tasks`);
	return tasks;
}
