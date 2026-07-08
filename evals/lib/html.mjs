// Self-contained HTML report for an eval run: summary and tag tables plus a
// filterable, expandable list of every item (question, answer, judge verdict).
// No external assets — the file works from disk years later.

const esc = (value) =>
	String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const groupKey = (record) => `${record.model} | ${record.thinking} | ${record.variant_id}`;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const normalized = (record) => record.score / (record.max_score || 1);
const fmt = (value) => (Number.isFinite(value) ? value.toFixed(2) : "—");

function groupBy(records, keyFn) {
	const groups = new Map();
	for (const record of records) {
		const key = keyFn(record);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(record);
	}
	return groups;
}

function scoreClass(record) {
	if (record.status === "error") return "err";
	const ratio = normalized(record);
	if (ratio >= 1) return "pass";
	if (ratio > 0) return "mid";
	return "fail";
}

function summaryRows(ok) {
	return [...groupBy(ok, groupKey)]
		.sort()
		.map(([key, group]) => {
			const [model, thinking, variant] = key.split(" | ");
			const total = group.reduce((sum, record) => sum + record.score, 0);
			const max = group.reduce((sum, record) => sum + (record.max_score || 1), 0);
			return `<tr><td><code>${esc(model)}</code></td><td>${esc(thinking)}</td><td><code>${esc(variant)}</code></td><td class="num">${group.length}</td><td class="num"><strong>${fmt(mean(group.map(normalized)))}</strong></td><td class="num">${total}/${max}</td></tr>`;
		})
		.join("\n");
}

function tagRows(ok) {
	const rows = [];
	for (const record of ok) for (const tag of record.tags ?? []) rows.push({ ...record, tag });
	if (!rows.length) return "";
	const body = [...groupBy(rows, (row) => `${groupKey(row)} | ${row.tag}`)]
		.sort()
		.map(([key, group]) => {
			const [model, thinking, variant, tag] = key.split(" | ");
			return `<tr><td><code>${esc(model)}</code></td><td>${esc(thinking)}</td><td><code>${esc(variant)}</code></td><td>${esc(tag)}</td><td class="num">${group.length}</td><td class="num">${fmt(mean(group.map(normalized)))}</td></tr>`;
		})
		.join("\n");
	return `<h2>Tags</h2><table><thead><tr><th>Model</th><th>Thinking</th><th>Variant</th><th>Tag</th><th class="num">Items</th><th class="num">Mean</th></tr></thead><tbody>${body}</tbody></table>`;
}

function itemBlock(record) {
	const cls = scoreClass(record);
	const badge =
		record.status === "error" ? "error" : `${record.score}/${record.max_score}`;
	const seconds = record.timing?.item_seconds;
	const sections = [
		["Question", record.question],
		["Answer", record.answer],
		record.error ? ["Error", record.error] : null,
	].filter(Boolean);
	const body = sections
		.map(([title, text]) => `<h4>${title}</h4><pre>${esc(String(text ?? "").trim() || "(empty)")}</pre>`)
		.join("\n");
	const meta = `variant <code>${esc(record.variant_id)}</code> · sample ${record.sample}${Number.isFinite(seconds) ? ` · ${fmt(seconds)}s` : ""}${record.judge_model ? ` · judge <code>${esc(record.judge_model)}</code>` : ""}`;
	return `<details class="item" data-model="${esc(record.model)}" data-variant="${esc(record.variant_id)}" data-tags="${esc((record.tags ?? []).join(" "))}" data-status="${cls}">
<summary><span class="badge ${cls}">${esc(badge)}</span> <code>${esc(record.case_id)}</code> <span class="model">${esc(record.model)} (${esc(record.thinking)})</span> — ${esc(record.description)}</summary>
<div class="meta">${meta}</div>
${body}
</details>`;
}

export function buildHtml(config, records) {
	const ok = records.filter((record) => record.status === "ok" && typeof record.score === "number");
	const errors = records.filter((record) => record.status === "error");
	const options = (values) => [...new Set(values)].sort().map((value) => `<option>${esc(value)}</option>`).join("");
	const tags = [...new Set(records.flatMap((record) => record.tags ?? []))].sort();

	return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.benchmark)} — ${esc(config.run_id)}</title>
<style>
:root { color-scheme: light dark; --pass:#1a7f37; --mid:#9a6700; --fail:#cf222e; --err:#57606a; --border:color-mix(in srgb, currentColor 18%, transparent); }
body { font: 15px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; max-width: 72rem; margin: 2rem auto; padding: 0 1rem; }
h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; } h4 { margin: .8rem 0 .2rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; opacity: .7; }
table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; }
th, td { text-align: left; padding: .35rem .6rem; border-bottom: 1px solid var(--border); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
code { font-size: .85em; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; background: color-mix(in srgb, currentColor 6%, transparent); padding: .6rem .8rem; border-radius: 6px; margin: 0 0 .6rem; }
.badge { display: inline-block; min-width: 2.6em; text-align: center; padding: 0 .45em; border-radius: 999px; color: #fff; font-size: .8em; font-weight: 600; }
.badge.pass { background: var(--pass); } .badge.mid { background: var(--mid); } .badge.fail { background: var(--fail); } .badge.err { background: var(--err); }
.item { border: 1px solid var(--border); border-radius: 8px; padding: .45rem .8rem; margin: .4rem 0; }
.item > summary { cursor: pointer; } .item .model { opacity: .65; font-size: .9em; }
.meta { font-size: .85em; opacity: .7; margin: .4rem 0; }
#filters { display: flex; flex-wrap: wrap; gap: .5rem; margin: .8rem 0; }
#filters select, #filters input { font: inherit; padding: .25rem .4rem; }
.counts { opacity: .7; font-size: .9em; align-self: center; }
</style>
<h1>${esc(config.benchmark)} <span style="opacity:.6">/ ${esc(config.run_id)}</span>${config.dry_run ? " <em>(dry run)</em>" : ""}</h1>
<p class="meta">${esc(config.created ?? "")} · ${records.length} records · ${errors.length} errors${config.judge ? ` · judge <code>${esc(config.judge.model)}</code>` : ""}</p>

<h2>Summary</h2>
<table><thead><tr><th>Model</th><th>Thinking</th><th>Variant</th><th class="num">Items</th><th class="num">Mean</th><th class="num">Score</th></tr></thead>
<tbody>${summaryRows(ok) || "<tr><td colspan=6>No scored results.</td></tr>"}</tbody></table>

${tagRows(ok)}

<h2>Items</h2>
<div id="filters">
<select id="f-model"><option value="">all models</option>${options(records.map((record) => record.model))}</select>
<select id="f-variant"><option value="">all variants</option>${options(records.map((record) => record.variant_id))}</select>
${tags.length ? `<select id="f-tag"><option value="">all tags</option>${options(tags)}</select>` : ""}
<select id="f-status"><option value="">all results</option><option value="pass">passed</option><option value="mid">partial</option><option value="fail">failed</option><option value="err">errors</option></select>
<input id="f-search" type="search" placeholder="search case / text">
<span class="counts" id="f-count"></span>
</div>
${records.map(itemBlock).join("\n")}
<script>
const filters = ["f-model", "f-variant", "f-tag", "f-status", "f-search"].map((id) => document.getElementById(id)).filter(Boolean);
const items = [...document.querySelectorAll(".item")];
function apply() {
	const [model, variant, tag, status, search] = ["f-model", "f-variant", "f-tag", "f-status", "f-search"].map((id) => document.getElementById(id)?.value ?? "");
	let shown = 0;
	for (const item of items) {
		const visible =
			(!model || item.dataset.model === model) &&
			(!variant || item.dataset.variant === variant) &&
			(!tag || item.dataset.tags.split(" ").includes(tag)) &&
			(!status || item.dataset.status === status) &&
			(!search || item.textContent.toLowerCase().includes(search.toLowerCase()));
		item.style.display = visible ? "" : "none";
		if (visible) shown++;
	}
	document.getElementById("f-count").textContent = shown + " / " + items.length;
}
for (const el of filters) el.addEventListener("input", apply);
apply();
</script>
</html>
`;
}
