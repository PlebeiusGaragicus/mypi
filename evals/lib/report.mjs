// Report and compare rendering for eval runs.
//
// Records are the per-item parsed.json artifacts; a "cell" is one
// case x model x thinking x variant combination with its samples averaged.
// Compare works on cells so a sample-count change between runs still lines up.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

export function collectRecords(runDir) {
	const artifactsDir = path.join(runDir, "artifacts");
	if (!existsSync(artifactsDir)) return [];
	const records = [];
	for (const entry of readdirSync(artifactsDir).sort()) {
		const parsedPath = path.join(artifactsDir, entry, "parsed.json");
		if (!existsSync(parsedPath)) continue;
		records.push(JSON.parse(readFileSync(parsedPath, "utf8")));
	}
	return records;
}

const groupKey = (record) => `${record.model} | ${record.thinking} | ${record.variant_id}`;
const cellKey = (record) => `${record.case_id} | ${groupKey(record)}`;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const fmt = (value) => (Number.isFinite(value) ? value.toFixed(2) : "");
const escapeCell = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const truncate = (value, max = 90) => (value.length > max ? `${value.slice(0, max)}…` : value);

function scored(records) {
	return records.filter((record) => record.status === "ok" && typeof record.score === "number");
}

function groupBy(records, keyFn) {
	const groups = new Map();
	for (const record of records) {
		const key = keyFn(record);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(record);
	}
	return groups;
}

// Normalized score (score/max_score) so mixed-scale benchmarks still compare.
const normalized = (record) => record.score / (record.max_score || 1);

export function buildReport(config, records) {
	const errors = records.filter((record) => record.status === "error");
	const ok = scored(records);
	const lines = [
		`# ${config.benchmark} report`,
		"",
		`Run: \`${config.run_id}\`${config.dry_run ? " (dry run)" : ""}`,
		"",
		`Records: ${records.length} (${errors.length} errors)`,
		"",
		"## Summary",
		"",
	];

	if (!ok.length) {
		lines.push("No scored results.");
	} else {
		lines.push("| Model | Thinking | Variant | Items | Mean | Score |", "|---|---|---|---:|---:|---:|");
		for (const [key, group] of [...groupBy(ok, groupKey)].sort()) {
			const [model, thinking, variant] = key.split(" | ");
			const avg = mean(group.map(normalized));
			const total = group.reduce((sum, record) => sum + record.score, 0);
			const max = group.reduce((sum, record) => sum + (record.max_score || 1), 0);
			lines.push(`| \`${model}\` | ${thinking} | \`${variant}\` | ${group.length} | ${fmt(avg)} | ${total}/${max} |`);
		}
	}

	const tagged = ok.filter((record) => Array.isArray(record.tags) && record.tags.length);
	if (tagged.length) {
		lines.push("", "## Tags", "", "| Model | Thinking | Variant | Tag | Items | Mean |", "|---|---|---|---|---:|---:|");
		const rows = [];
		for (const record of tagged) {
			for (const tag of record.tags) rows.push({ ...record, tag });
		}
		for (const [key, group] of [...groupBy(rows, (row) => `${groupKey(row)} | ${row.tag}`)].sort()) {
			const [model, thinking, variant, tag] = key.split(" | ");
			lines.push(`| \`${model}\` | ${thinking} | \`${variant}\` | ${tag} | ${group.length} | ${fmt(mean(group.map(normalized)))} |`);
		}
	}

	const failures = ok.filter((record) => record.score < (record.max_score || 1));
	if (failures.length) {
		lines.push("", "## Failures", "", "| Case | Model | Thinking | Variant | Sample | Answer | Why |", "|---|---|---|---|---:|---|---|");
		for (const record of failures) {
			lines.push(
				`| \`${record.case_id}\` | \`${record.model}\` | ${record.thinking} | \`${record.variant_id}\` | ${record.sample} | ${escapeCell(truncate(String(record.answer ?? "")))} | ${escapeCell(record.description)} |`,
			);
		}
	}

	if (errors.length) {
		lines.push("", "## Errors", "");
		for (const record of errors) {
			lines.push(`- \`${record.item_id}\` (${record.phase ?? "unknown"} phase): ${escapeCell(truncate(String(record.error ?? ""), 200))}`);
		}
	}

	if (ok.length) {
		lines.push("", "## Case Results", "", "| Case | Model | Thinking | Variant | Sample | Score | Seconds | Description |", "|---|---|---|---|---:|---:|---:|---|");
		for (const record of ok) {
			const seconds = record.timing?.answer_seconds;
			lines.push(
				`| \`${record.case_id}\` | \`${record.model}\` | ${record.thinking} | \`${record.variant_id}\` | ${record.sample} | ${record.score}/${record.max_score} | ${fmt(seconds)} | ${escapeCell(record.description)} |`,
			);
		}
	}

	lines.push("");
	return lines.join("\n");
}

function cellMeans(records) {
	const cells = new Map();
	for (const [key, group] of groupBy(scored(records), cellKey)) {
		cells.set(key, { mean: mean(group.map(normalized)), records: group });
	}
	return cells;
}

export function buildCompare(a, b) {
	const cellsA = cellMeans(a.records);
	const cellsB = cellMeans(b.records);
	const sharedKeys = [...cellsA.keys()].filter((key) => cellsB.has(key)).sort();
	const onlyA = [...cellsA.keys()].filter((key) => !cellsB.has(key));
	const onlyB = [...cellsB.keys()].filter((key) => !cellsA.has(key));

	const lines = [
		"# Eval comparison",
		"",
		`- A: \`${a.label}\``,
		`- B: \`${b.label}\``,
		`- Shared cells: ${sharedKeys.length}${onlyA.length ? `; only in A: ${onlyA.length}` : ""}${onlyB.length ? `; only in B: ${onlyB.length}` : ""}`,
		"",
	];
	if (!sharedKeys.length) {
		lines.push("No overlapping cells to compare — check that both runs cover the same cases, models, and variants.", "");
		return lines.join("\n");
	}

	lines.push("## Summary", "", "| Model | Thinking | Variant | Cells | Mean A | Mean B | Delta |", "|---|---|---|---:|---:|---:|---:|");
	const byGroup = groupBy(
		sharedKeys.map((key) => ({ key, group: key.split(" | ").slice(1).join(" | ") })),
		(row) => row.group,
	);
	for (const [group, rows] of [...byGroup].sort()) {
		const [model, thinking, variant] = group.split(" | ");
		const meanA = mean(rows.map((row) => cellsA.get(row.key).mean));
		const meanB = mean(rows.map((row) => cellsB.get(row.key).mean));
		lines.push(
			`| \`${model}\` | ${thinking} | \`${variant}\` | ${rows.length} | ${fmt(meanA)} | ${fmt(meanB)} | ${delta(meanB - meanA)} |`,
		);
	}

	const changed = sharedKeys
		.map((key) => ({ key, a: cellsA.get(key), b: cellsB.get(key) }))
		.filter((cell) => Math.abs(cell.b.mean - cell.a.mean) > 1e-9);
	const regressions = changed.filter((cell) => cell.b.mean < cell.a.mean);
	const improvements = changed.filter((cell) => cell.b.mean > cell.a.mean);

	for (const [title, cells] of [
		["Regressions (B worse than A)", regressions],
		["Improvements (B better than A)", improvements],
	]) {
		lines.push("", `## ${title}`, "");
		if (!cells.length) {
			lines.push("None.");
			continue;
		}
		lines.push("| Case | Model | Thinking | Variant | A | B | Why (B) |", "|---|---|---|---|---:|---:|---|");
		for (const cell of cells) {
			const [caseId, model, thinking, variant] = cell.key.split(" | ");
			const why = cell.b.records.map((record) => record.description).join("; ");
			lines.push(
				`| \`${caseId}\` | \`${model}\` | ${thinking} | \`${variant}\` | ${fmt(cell.a.mean)} | ${fmt(cell.b.mean)} | ${escapeCell(truncate(why, 140))} |`,
			);
		}
	}

	const tagRows = [];
	for (const key of sharedKeys) {
		const tags = cellsA.get(key).records[0]?.tags ?? [];
		for (const tag of tags) tagRows.push({ tag, deltaValue: cellsB.get(key).mean - cellsA.get(key).mean });
	}
	if (tagRows.length) {
		lines.push("", "## Tag deltas", "", "| Tag | Cells | Delta |", "|---|---:|---:|");
		for (const [tag, rows] of [...groupBy(tagRows, (row) => row.tag)].sort()) {
			lines.push(`| ${tag} | ${rows.length} | ${delta(mean(rows.map((row) => row.deltaValue)))} |`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

function delta(value) {
	if (Math.abs(value) < 1e-9) return "0.00";
	return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}
