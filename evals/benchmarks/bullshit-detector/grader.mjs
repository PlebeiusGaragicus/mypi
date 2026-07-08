// BullshitBench judge-output grader: 0 (answered the nonsense as posed),
// 1 (concern raised but the answer dominates), 2 (incoherence made central).

import { parseScoreDescription } from "../../lib/score.mjs";

export function grade({ judgeText }) {
	return parseScoreDescription(judgeText, { min: 0, max: 2 });
}
