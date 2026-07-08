// Shared parser for line-oriented judge output:
//
//   Score: <integer>
//   Description: <one sentence>
//
// Strict on purpose — a judge that can't follow a two-line output contract is
// recorded as a grade error, not silently coerced into a score.

export function parseScoreDescription(text, { min, max }) {
	const scoreMatch = String(text).match(/^\s*Score\s*:\s*(-?\d+)\s*$/im);
	if (!scoreMatch) throw new Error(`judge output is missing 'Score: <${min}-${max}>'`);
	const score = Number(scoreMatch[1]);
	if (score < min || score > max) throw new Error(`judge score ${score} is outside ${min}-${max}`);
	const descriptionMatch = String(text).match(/^\s*Description\s*:\s*(.+?)\s*$/im);
	if (!descriptionMatch) throw new Error("judge output is missing 'Description: ...'");
	return { score, maxScore: max, description: descriptionMatch[1].trim() };
}
