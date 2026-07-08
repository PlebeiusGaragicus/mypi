// Grader for the judge preset's output contract.
//
// Two independent points: correct verdict (PASS vs FAIL) and clean format
// (exactly one line, `PASS: <sentence>` or `FAIL: <sentence>`, nothing else).
// Splitting them keeps the failure modes distinct — a judge that reasons
// correctly but rambles needs a different prompt fix than one that formats
// perfectly and judges wrong.

const short = (value, max = 60) => (value.length > max ? `${value.slice(0, max)}…` : value);

export function grade({ caseData, answer }) {
	const expected = String(caseData.expected).toUpperCase();
	const trimmed = String(answer ?? "").trim();
	const maxScore = 2;

	if (!trimmed) return { score: 0, maxScore, description: "empty reply" };

	const clean = /^(PASS|FAIL): [^\n]+$/.exec(trimmed);
	// Fallback verdict detection for format-broken replies: first PASS/FAIL
	// mention anywhere (case-insensitive).
	const loose = /\b(PASS|FAIL)\b/i.exec(trimmed);
	const verdict = clean ? clean[1] : loose ? loose[1].toUpperCase() : null;

	if (!verdict) return { score: 0, maxScore, description: `no PASS/FAIL verdict found: "${short(trimmed)}"` };

	const verdictPoint = verdict === expected ? 1 : 0;
	const formatPoint = clean ? 1 : 0;
	const verdictNote = verdictPoint ? "correct verdict" : `wrong verdict (said ${verdict}, expected ${expected})`;
	const formatNote = formatPoint
		? "clean format"
		: trimmed.includes("\n")
			? "format broken: multi-line reply"
			: `format broken: not exactly 'PASS|FAIL: <sentence>' ("${short(trimmed)}")`;
	return { score: verdictPoint + formatPoint, maxScore, description: `${verdictNote}; ${formatNote}` };
}
