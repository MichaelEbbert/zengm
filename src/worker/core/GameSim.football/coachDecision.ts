// Deterministic play-calling logic ported from zengm-coach Python sidecar.

const RUN_CONVERSION_4YD = 0.655;
const FG_THRESHOLD = 0.45;
const FG_MIN_PROBABILITY = 0.4;

export function determineMode(
	scoreDiff: number,
	quarter: number,
	clockMinutes: number,
): "normal" | "desperation" | "protection" {
	const clock = clockMinutes ?? 15;
	const margin = Math.abs(scoreDiff);
	const trailing = scoreDiff < 0;

	if (quarter >= 5 && trailing) return "desperation";
	if (quarter === 4 && trailing) {
		if (margin <= 3 && clock < 3) return "desperation";
		if (margin <= 7 && clock < 5) return "desperation";
		if (margin >= 8 && clock < 8) return "desperation";
	}
	if (quarter === 4 && scoreDiff >= 4 && clock < 8) return "protection";
	return "normal";
}

function goPlay(
	toGo: number,
	passCompletions: number,
	passAttempts: number,
): "run" | "pass" {
	if (toGo <= 3) return "run";
	if (toGo === 4) {
		if (
			passAttempts > 0 &&
			passCompletions / passAttempts >= RUN_CONVERSION_4YD
		)
			return "pass";
		return "run";
	}
	return "pass";
}

export function playDecision(
	down: number,
	toGo: number,
	scrimmage: number,
	rushAttempts: number,
	rushYards: number,
	passAttempts: number,
	passYards: number,
	passCompletions: number,
	quarter: number,
	clockMinutes: number,
	mode: "normal" | "desperation" | "protection",
): "run" | "pass" {
	const clock = clockMinutes ?? 15;

	if (mode === "desperation") {
		if (quarter === 4 && clock < 1 && (scrimmage ?? 0) < 50) return "pass";
		if (toGo <= 2) return "run";
		return "pass";
	}

	if (mode === "protection") {
		if (down === 1) return "run";
		if (toGo <= 5) return "run";
		return "pass";
	}

	// Normal mode
	if (down === 1) {
		if (toGo > 10) return "pass";
		const ra = rushAttempts || 0;
		const pa = passAttempts || 0;
		if (ra < 6 || pa < 6) return "run";
		const ypc = (rushYards || 0) / ra;
		const ypa = (passYards || 0) / pa;
		const denom = ypc + ypa;
		const runProb = denom > 0 ? ypc / denom : 0.5;
		return Math.random() < runProb ? "run" : "pass";
	}

	// 2nd or 3rd down
	return toGo <= 4 ? "run" : "pass";
}

export function fourthDownDecision(
	toGo: number,
	scrimmage: number,
	canPunt: boolean,
	canKickFieldGoal: boolean,
	fgProbability: number,
	quarter: number,
	scoreDiff: number,
	clockMinutes: number,
	mode: "normal" | "desperation" | "protection",
	passCompletions: number,
	passAttempts: number,
): "run" | "pass" | "fieldGoal" | "punt" {
	const clock = clockMinutes ?? 15;
	const margin = Math.abs(scoreDiff);

	const go = () => goPlay(toGo, passCompletions, passAttempts);
	const puntOrGo = () => (canPunt ? "punt" : go()) as "run" | "pass" | "punt";
	const fgOrPunt = () =>
		canKickFieldGoal && fgProbability >= FG_MIN_PROBABILITY
			? ("fieldGoal" as const)
			: "punt";

	if (mode === "protection") return fgOrPunt();

	if (mode === "desperation") {
		if (margin >= 8) return go();
		if (clock <= 4) return go();
		return normalDecision(
			toGo,
			scrimmage,
			canKickFieldGoal,
			fgProbability,
			go,
			puntOrGo,
		);
	}

	return normalDecision(
		toGo,
		scrimmage,
		canKickFieldGoal,
		fgProbability,
		go,
		puntOrGo,
	);
}

function normalDecision(
	toGo: number,
	scrimmage: number,
	canKickFieldGoal: boolean,
	fgProbability: number,
	go: () => "run" | "pass",
	puntOrGo: () => "run" | "pass" | "punt",
): "run" | "pass" | "fieldGoal" | "punt" {
	if (canKickFieldGoal && fgProbability >= FG_MIN_PROBABILITY) {
		if (fgProbability > FG_THRESHOLD) return "fieldGoal";
		if (toGo <= 2) return go();
		return puntOrGo();
	}

	if (scrimmage < 40) return puntOrGo();
	if (scrimmage < 50) return toGo <= 1 ? go() : puntOrGo();
	if (scrimmage < 56) return toGo <= 2 ? go() : puntOrGo();
	if (scrimmage < 70) return toGo <= 3 ? go() : puntOrGo();
	return toGo <= 4 ? go() : puntOrGo();
}
