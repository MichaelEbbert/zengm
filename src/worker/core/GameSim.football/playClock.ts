// Live-action time per play, snap to whistle -- part 1 of the "new clock" plan
// in docs/clock_play_pacing.md. Dead time between plays is separate.

import { random } from "../../util/index.ts";

// 97% of plays: Gaussian, redrawn below the floor, capped. Big plays: uniform
// in their own range. Redrawing lifts the normal-play mean to ~5.88s, which
// with ~3% big plays averages ~6s.
export const PLAY_LENGTH = {
	mean: 5.8,
	sd: 1,
	floor: 4,
	cap: 10,
	bigMin: 10,
	bigMax: 12,
} as const;

// A hurry-up offense (hurryUp() at the snap) runs quicker plays -- sideline
// throws, snap-and-go. Normal plays only; big plays, touchbacks and untimed
// plays are unchanged. Approved 2026-09-11: some 3-4s plays are fine here.
export const HURRY_UP_PLAY_LENGTH = {
	mean: 4.5,
	sd: 1,
	floor: 3,
} as const;

// Punt and interception touchbacks, and fair catches: hang time only
export const TOUCHBACK_LENGTH = [4, 6] as const;

// A play is big -- 10-12s -- when the ball is carried this far, or returned
// this far on a kick. ~3.7% of scrimmage plays and ~4% of returns in the
// harness; returns need the higher bar because half of kick returns go 20+.
export const BIG_PLAY_YARDS = {
	carry: 20,
	return: 30,
} as const;

// Share of each outcome that ends out of bounds and stops the clock -- part 2
// of the plan. Real-football estimates: 5-8% of runs, 12-15% of pass plays
// (~18-23% of completions, which is what this rolls on). Sacks and recovered
// fumbles are unchanged from the engine's originals.
export const OUT_OF_BOUNDS_RATE = {
	run: 0.065,
	completion: 0.2,
	sack: 0.02,
	recoveredFumble: 0.05,
} as const;

// A hurry-up offense (hurryUp() at the snap) works the sideline, so more of
// its runs and completions end out of bounds -- which inside the late windows
// stops the clock outright. Part of piece 4. Tuned against the comeback
// guardrail: 60% / 20% was needed while penalties kept their late dead time;
// with penalties stopping the clock late (2026-09-11), 52% / 17% ("H") matches
// the pre-change baseline within ~1-2 points.
export const HURRY_UP_OUT_OF_BOUNDS_RATE = {
	run: 0.17,
	completion: 0.52,
} as const;

export type PlayOutcome =
	// Extra point or two-point try
	| { type: "untimed" }
	// Foul before the snap, or a kickoff touchback (the clock never starts)
	| { type: "noPlay" }
	| { type: "touchback" }
	| { type: "play"; carryYds: number; returnYds: number };

// Events that mean the ball was snapped or kicked
const SNAP_TYPES = new Set([
	"rus",
	"dropback",
	"sk",
	"k",
	"onsideKick",
	"p",
	"fg",
	"xp",
	"kneel",
	"twoPointConversion",
]);

/**
 * What a play amounts to for the clock, from its events. Carry yards add up
 * over the whole play (a catch, then a fumble returned the other way), since
 * one play gets one time draw.
 */
export const playOutcome = (
	events: { type: string; yds?: number; ydsReturn?: number }[],
): PlayOutcome => {
	const types = new Set(events.map((e) => e.type));

	if (types.has("xp") || types.has("twoPointConversion")) {
		return { type: "untimed" };
	}
	if (
		types.has("touchbackKick") ||
		!events.some((e) => SNAP_TYPES.has(e.type))
	) {
		return { type: "noPlay" };
	}
	if (types.has("touchbackPunt") || types.has("touchbackInt")) {
		return { type: "touchback" };
	}

	let carryYds = 0;
	let returnYds = 0;
	for (const e of events) {
		if (e.type === "rus" || e.type === "pssCmp" || e.type === "fmbRec") {
			carryYds += Math.abs(e.yds ?? 0);
		} else if (e.type === "int") {
			carryYds += Math.abs(e.ydsReturn ?? 0);
		} else if (
			e.type === "kr" ||
			e.type === "pr" ||
			e.type === "onsideKickRecovery"
		) {
			returnYds += Math.abs(e.yds ?? 0);
		}
	}
	return { type: "play", carryYds, returnYds };
};

// Dead time after the play, snap-to-snap minus the play itself -- part 3 of
// the plan. Gaussian, redrawn outside the clip. A normal-tempo offense snaps
// with ~8s left on the 40s play clock (32s); out of bounds the clock is
// stopped ~8s while the ball is spotted (24s); a change of possession is
// timed like out of bounds; a penalty is the call, the walk-off and a huddle.
// Config K (2026-09-11): every mean 0.5s below the plan's 32 / 24 / 24 / 16,
// clip ranges moved with them. Lands plays and points per game on the old
// clock's (63.8 plays, 23.8 points per team-game in the harness).
export const DEAD_TIME = {
	inBounds: { mean: 31.5, sd: 3.5, min: 23.5, max: 38.5 },
	outOfBounds: { mean: 23.5, sd: 3.5, min: 15.5, max: 30.5 },
	possessionChange: { mean: 23.5, sd: 3.5, min: 15.5, max: 30.5 },
	penalty: { mean: 15.5, sd: 3.5, min: 7.5, max: 22.5 },
	// Called right after the whistle
	timeout: { min: 0, max: 2 },
	// The engine's original hurry-up huddle, whole seconds; piece 4 revisits it
	hurryUp: { min: 5, max: 13 },
} as const;

// Out of bounds and changes of possession stop the clock outright in the last
// minutes of a half: 2:00 before halftime, 5:00 at the end of the game and of
// each overtime period
export const LATE_WINDOW_MINUTES = {
	firstHalf: 2,
	final: 5,
} as const;

// penaltyDeadTime: whether penalties keep their dead time inside the late
// windows. Approved 2026-09-11: false -- they stop the clock outright there,
// like out of bounds, which closes most of the late-game comeback gap.
export const LATE_WINDOW_RULES = {
	penaltyDeadTime: false,
};

export type DeadTimeCase =
	| "none"
	| "timeout"
	| "inBounds"
	| "hurryUp"
	| "outOfBounds"
	| "possessionChange"
	| "penalty";

/**
 * Which dead-time rule applies after a play, first match wins. hurryUp is a
 * callback so the engine's hurryUp() is only consulted when the clock is
 * still running, as before.
 */
export const deadTimeCase = ({
	kneel,
	twoMinuteWarning,
	timeout,
	scoredOrTry,
	penalty,
	touchback,
	possessionChange,
	onsideRecovered,
	incompletion,
	outOfBounds,
	clockRunning,
	lateWindow,
	penaltyDeadTimeInLateWindows,
	hurryUp,
}: {
	// A kneel's own time already includes the dead time after it
	kneel: boolean;
	twoMinuteWarning: boolean;
	timeout: boolean;
	scoredOrTry: boolean;
	// A penalty was enforced (accepted, or offsetting)
	penalty: boolean;
	touchback: boolean;
	possessionChange: boolean;
	// Onside kick recovered by the kicking team
	onsideRecovered: boolean;
	incompletion: boolean;
	outOfBounds: boolean;
	clockRunning: boolean;
	lateWindow: boolean;
	// LATE_WINDOW_RULES.penaltyDeadTime
	penaltyDeadTimeInLateWindows: boolean;
	hurryUp: () => boolean;
}): DeadTimeCase => {
	if (kneel || twoMinuteWarning) {
		return "none";
	}
	if (timeout) {
		return "timeout";
	}
	if (scoredOrTry) {
		return "none";
	}
	if (penalty) {
		return lateWindow && !penaltyDeadTimeInLateWindows ? "none" : "penalty";
	}
	if (touchback) {
		return "none";
	}
	if (possessionChange) {
		return lateWindow ? "none" : "possessionChange";
	}
	if (onsideRecovered) {
		return "inBounds";
	}
	if (incompletion) {
		return "none";
	}
	if (outOfBounds) {
		return lateWindow ? "none" : "outOfBounds";
	}
	if (clockRunning) {
		return hurryUp() ? "hurryUp" : "inBounds";
	}
	return "none";
};

/** Seconds of dead time for a case, before the pace setting. */
export const deadTime = (c: DeadTimeCase) => {
	if (c === "none") {
		return 0;
	}
	if (c === "timeout") {
		return random.uniform(DEAD_TIME.timeout.min, DEAD_TIME.timeout.max);
	}
	if (c === "hurryUp") {
		return random.randInt(DEAD_TIME.hurryUp.min, DEAD_TIME.hurryUp.max);
	}
	const { mean, sd, min, max } = DEAD_TIME[c];
	return random.truncGauss(mean, sd, min, max);
};

/** Seconds of live action for a play; hurryUp = the offense was hurrying at the snap. */
export const playLength = (outcome: PlayOutcome, hurryUp = false) => {
	if (outcome.type === "untimed" || outcome.type === "noPlay") {
		return 0;
	}
	if (outcome.type === "touchback") {
		return random.uniform(TOUCHBACK_LENGTH[0], TOUCHBACK_LENGTH[1]);
	}

	if (
		outcome.carryYds >= BIG_PLAY_YARDS.carry ||
		outcome.returnYds >= BIG_PLAY_YARDS.return
	) {
		return random.uniform(PLAY_LENGTH.bigMin, PLAY_LENGTH.bigMax);
	}

	const { mean, sd, floor } = hurryUp ? HURRY_UP_PLAY_LENGTH : PLAY_LENGTH;
	let seconds;
	do {
		seconds = random.realGauss(mean, sd);
	} while (seconds < floor);
	return Math.min(seconds, PLAY_LENGTH.cap);
};
