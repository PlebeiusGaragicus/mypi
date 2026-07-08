// SkibidiBench judge-output grader: binary — 1 if the user walks away with
// the core slang meaning, 0 otherwise.

import { parseScoreDescription } from "../../lib/score.mjs";

export function grade({ judgeText }) {
	return parseScoreDescription(judgeText, { min: 0, max: 1 });
}
