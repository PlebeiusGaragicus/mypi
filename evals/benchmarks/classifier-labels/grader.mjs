// Exact-match grader for the classifier preset.
//
// Pass requires the whitespace-trimmed reply to equal `expected` exactly —
// the preset promises "only the class name and nothing more". Every failure
// mode gets a distinct description; those descriptions are the actionable
// feedback for prompt tuning (wrong casing vs. preamble vs. wrong label are
// fixed by different prompt edits).

function categoriesFrom(caseData) {
	try {
		const parsed = JSON.parse(caseData.question);
		return Array.isArray(parsed.category) ? parsed.category.map(String) : [];
	} catch {
		return [];
	}
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const short = (value, max = 60) => (value.length > max ? `${value.slice(0, max)}…` : value);

export function grade({ caseData, answer }) {
	const expected = String(caseData.expected);
	const trimmed = String(answer ?? "").trim();
	const maxScore = 1;

	if (trimmed === expected) return { score: 1, maxScore, description: "exact match" };
	if (!trimmed) return { score: 0, maxScore, description: "empty reply" };

	const stripped = trimmed.replace(/^["'`*\s]+/, "").replace(/["'`*.\s]+$/, "");
	if (stripped === expected) {
		return { score: 0, maxScore, description: `right label wrapped in quotes/punctuation: "${short(trimmed)}"` };
	}
	if (trimmed.toLowerCase() === expected.toLowerCase()) {
		return { score: 0, maxScore, description: `right label with wrong casing: "${short(trimmed)}"` };
	}
	if (new RegExp(`\\b${escapeRegExp(expected)}\\b`, "i").test(trimmed)) {
		return { score: 0, maxScore, description: `right label buried in a longer reply: "${short(trimmed)}"` };
	}

	const other = categoriesFrom(caseData).find((category) => category !== expected && new RegExp(`\\b${escapeRegExp(category)}\\b`, "i").test(trimmed));
	if (other) {
		return { score: 0, maxScore, description: `wrong label: chose "${other}", expected "${expected}"` };
	}
	return { score: 0, maxScore, description: `reply is not a listed category: "${short(trimmed)}"` };
}
