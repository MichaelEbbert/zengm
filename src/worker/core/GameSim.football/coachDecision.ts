// Deterministic play-calling logic ported from zengm-coach Python sidecar.

const RUN_CONVERSION_4YD = 0.655;
const FG_THRESHOLD = 0.45;
const FG_MIN_PROBABILITY = 0.4;

// 1st down in normal mode, before the offense has 5 rushes and 5 dropbacks to
// compare: pass this often on 1st and 6-10, always run on 1st and 5 or less.
// Added 2026-09-11; 0 restores the old always-run behavior.
const EARLY_FIRST_DOWN_PASS_RATE = 0.25;
const EARLY_FIRST_DOWN_ALWAYS_RUN_TO_GO = 5;

// Switches for the 4th-down trials in docs/fourth_down_when_leading.md, set per
// run with SIM_TUNE. Every default keeps the original behavior except
// fgWindowUsesTable, adopted 2026-11-02 (FUTURE_PLANS.md item 8).
export const FOURTH_DOWN_TUNING = {
	// Punt instead of going for it near midfield when leading by at least this
	// much, from leadPuntFromQuarter on. null turns the rule off.
	leadPuntMinLead: null as number | null,
	leadPuntFromQuarter: 1,
	leadPuntMinScrimmage: 40,
	leadPuntMaxScrimmage: 55,
	// In protection mode, kick at this make chance or better, otherwise punt
	protectionFgMinProbability: FG_MIN_PROBABILITY,
	// In protection mode, use the field-position table when not kicking, instead
	// of always punting
	protectionUsesTable: false,
	// At a make chance of 0.40-0.45 on 4th and 3+, use the field-position table
	// instead of always punting. false restores the old behavior.
	fgWindowUsesTable: true,
};

// Switches for the desperation-mode research (FUTURE_PLANS.md item 3), set per
// run with SIM_TUNE. "closeGame" adopted 2026-11-02; "passHeavy" restores the
// original behavior.
export const DESPERATION_TUNING = {
	// "passHeavy": pass unless 2 yards or less to go (the original).
	// "normal": call plays as in normal mode.
	// "fgRange": normal-mode calls when down 3 or less, at the opponent's 35 or
	// closer, with 1:00+ left; passHeavy otherwise.
	// "closeGame": normal-mode calls when down 3 or less; passHeavy otherwise.
	playCalls: "closeGame" as "passHeavy" | "normal" | "fgRange" | "closeGame",
	// closeGame only applies with at least this many minutes left in the period.
	// 1.1 (1:06): from 1:00 down, pass-heavy wins more (docs/desperation_mode_research.md)
	closeGameMinClock: 1.1,
};

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
	scoreDiff = 0,
): "run" | "pass" {
	const clock = clockMinutes ?? 15;

	const { playCalls } = DESPERATION_TUNING;
	const desperationAsNormal =
		playCalls === "normal" ||
		(playCalls === "closeGame" &&
			scoreDiff >= -3 &&
			clock >= DESPERATION_TUNING.closeGameMinClock) ||
		(playCalls === "fgRange" &&
			scoreDiff >= -3 &&
			scrimmage >= 65 &&
			clock >= 1);
	if (mode === "desperation" && !desperationAsNormal) {
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
		if (ra < 5 || pa < 5) {
			if (toGo <= EARLY_FIRST_DOWN_ALWAYS_RUN_TO_GO) return "run";
			return Math.random() < EARLY_FIRST_DOWN_PASS_RATE ? "pass" : "run";
		}
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
		canKickFieldGoal &&
		fgProbability >= FOURTH_DOWN_TUNING.protectionFgMinProbability
			? ("fieldGoal" as const)
			: "punt";

	if (mode === "protection") {
		const call = fgOrPunt();
		if (call === "fieldGoal" || !FOURTH_DOWN_TUNING.protectionUsesTable) {
			return call;
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

	if (mode === "desperation") {
		// A field goal ties or wins when down 3 or less, so take it when in range
		if (margin <= 3 && canKickFieldGoal && fgProbability >= FG_MIN_PROBABILITY)
			return "fieldGoal";
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

	const { leadPuntMinLead, leadPuntFromQuarter } = FOURTH_DOWN_TUNING;
	return normalDecision(
		toGo,
		scrimmage,
		canKickFieldGoal,
		fgProbability,
		go,
		puntOrGo,
		leadPuntMinLead !== null &&
			scoreDiff >= leadPuntMinLead &&
			quarter >= leadPuntFromQuarter,
	);
}

function normalDecision(
	toGo: number,
	scrimmage: number,
	canKickFieldGoal: boolean,
	fgProbability: number,
	go: () => "run" | "pass",
	puntOrGo: () => "run" | "pass" | "punt",
	puntWhenLeading = false,
): "run" | "pass" | "fieldGoal" | "punt" {
	if (canKickFieldGoal && fgProbability >= FG_MIN_PROBABILITY) {
		if (fgProbability > FG_THRESHOLD) return "fieldGoal";
		if (toGo <= 2) return go();
		if (!FOURTH_DOWN_TUNING.fgWindowUsesTable) return puntOrGo();
	}

	if (
		puntWhenLeading &&
		scrimmage >= FOURTH_DOWN_TUNING.leadPuntMinScrimmage &&
		scrimmage <= FOURTH_DOWN_TUNING.leadPuntMaxScrimmage
	) {
		return puntOrGo();
	}

	if (scrimmage < 40) return puntOrGo();
	if (scrimmage < 50) return toGo <= 1 ? go() : puntOrGo();
	if (scrimmage < 56) return toGo <= 2 ? go() : puntOrGo();
	if (scrimmage < 70) return toGo <= 3 ? go() : puntOrGo();
	return toGo <= 4 ? go() : puntOrGo();
}
