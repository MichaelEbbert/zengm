import { assert, describe, test } from "vitest";
import {
	BIG_PLAY_YARDS,
	DEAD_TIME,
	LATE_WINDOW_RULES,
	deadTime,
	deadTimeCase,
	playLength,
	playOutcome,
	type DeadTimeCase,
	type PlayOutcome,
} from "./playClock.ts";

const N = 200_000;

const draws = (outcome: PlayOutcome) =>
	Array.from({ length: N }, () => playLength(outcome));

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const min = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b), Infinity);
const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), -Infinity);
const share = (xs: number[], lo: number, hi: number) =>
	xs.filter((x) => x >= lo && x < hi).length / xs.length;

const near = (
	actual: number,
	expected: number,
	tolerance: number,
	what: string,
) =>
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${what}: expected ${expected} +/- ${tolerance}, got ${actual}`,
	);

describe("playLength", () => {
	test("a normal play is Gaussian around 5.8s, redrawn below 4s, capped at 10s", () => {
		const xs = draws({ type: "play", carryYds: 5, returnYds: 0 });
		assert.ok(min(xs) >= 4, `min ${min(xs)}`);
		assert.ok(max(xs) <= 10, `max ${max(xs)}`);

		// Redrawing below 4 lifts the mean from 5.8 to 5.88
		near(mean(xs), 5.88, 0.02, "mean");
		near(share(xs, 4, 5), 0.183, 0.005, "4-5s");
		near(share(xs, 5, 6), 0.381, 0.005, "5-6s");
		near(share(xs, 6, 7), 0.317, 0.005, "6-7s");
		near(share(xs, 7, 8), 0.105, 0.005, "7-8s");
		near(share(xs, 8, 10.001), 0.014, 0.003, "8-10s");
	});

	test("a hurry-up play is Gaussian around 4.5s, redrawn below 3s, capped at 10s", () => {
		const xs = Array.from({ length: N }, () =>
			playLength({ type: "play", carryYds: 5, returnYds: 0 }, true),
		);
		assert.ok(min(xs) >= 3, `min ${min(xs)}`);
		assert.ok(max(xs) <= 10, `max ${max(xs)}`);
		// Redrawing below 3 lifts the mean from 4.5 to 4.64
		near(mean(xs), 4.64, 0.02, "mean");
		near(share(xs, 3, 4), 0.259, 0.005, "3-4s");
	});

	test("hurry-up doesn't change big plays, touchbacks or untimed plays", () => {
		const big = Array.from({ length: 10_000 }, () =>
			playLength(
				{ type: "play", carryYds: BIG_PLAY_YARDS.carry, returnYds: 0 },
				true,
			),
		);
		assert.ok(min(big) >= 10, `big min ${min(big)}`);
		const touchbacks = Array.from({ length: 10_000 }, () =>
			playLength({ type: "touchback" }, true),
		);
		assert.ok(min(touchbacks) >= 4 && max(touchbacks) <= 6);
		assert.strictEqual(playLength({ type: "untimed" }, true), 0);
	});

	test("a big play is uniform between 10s and 12s", () => {
		const xs = draws({
			type: "play",
			carryYds: BIG_PLAY_YARDS.carry,
			returnYds: 0,
		});
		assert.ok(min(xs) >= 10, `min ${min(xs)}`);
		assert.ok(max(xs) <= 12, `max ${max(xs)}`);
		near(mean(xs), 11, 0.02, "mean");
		near(share(xs, 10, 11), 0.5, 0.01, "10-11s");
	});

	test("a long return is a big play", () => {
		const xs = draws({
			type: "play",
			carryYds: 0,
			returnYds: BIG_PLAY_YARDS.return,
		});
		assert.ok(min(xs) >= 10, `min ${min(xs)}`);
	});

	test("a yard short of either threshold is a normal play", () => {
		const xs = draws({
			type: "play",
			carryYds: BIG_PLAY_YARDS.carry - 1,
			returnYds: BIG_PLAY_YARDS.return - 1,
		});
		assert.ok(max(xs) <= 10, `max ${max(xs)}`);
	});

	test("touchbacks and fair catches take 4-6s of hang time", () => {
		const xs = draws({ type: "touchback" });
		assert.ok(min(xs) >= 4, `min ${min(xs)}`);
		assert.ok(max(xs) <= 6, `max ${max(xs)}`);
		near(mean(xs), 5, 0.02, "mean");
	});

	test("untimed plays and plays that never happen take no time", () => {
		assert.strictEqual(playLength({ type: "untimed" }), 0);
		assert.strictEqual(playLength({ type: "noPlay" }), 0);
	});
});

describe("playOutcome", () => {
	const ev = (type: string, fields: Record<string, number> = {}) => ({
		type,
		...fields,
	});

	test("extra points and two-point tries are untimed", () => {
		assert.deepStrictEqual(playOutcome([ev("xp")]), { type: "untimed" });
		assert.deepStrictEqual(
			playOutcome([
				ev("twoPointConversion"),
				ev("dropback"),
				ev("pss"),
				ev("pssCmp", { yds: 3 }),
				ev("pssTD"),
				ev("twoPointConversionDone"),
			]),
			{ type: "untimed" },
		);
	});

	test("a kickoff touchback never starts the clock", () => {
		assert.deepStrictEqual(
			playOutcome([
				ev("k", { kickTo: -5 }),
				ev("possessionChange", { yds: 0 }),
				ev("touchbackKick"),
			]),
			{ type: "noPlay" },
		);
	});

	test("a foul before the snap is no play", () => {
		assert.deepStrictEqual(playOutcome([ev("penalty")]), { type: "noPlay" });
	});

	test("punt and interception touchbacks are hang time only", () => {
		assert.deepStrictEqual(
			playOutcome([
				ev("p", { yds: 50 }),
				ev("possessionChange", { yds: 0 }),
				ev("touchbackPunt"),
			]),
			{ type: "touchback" },
		);
		assert.deepStrictEqual(
			playOutcome([
				ev("dropback"),
				ev("pss"),
				ev("possessionChange", { yds: 30 }),
				ev("int", { ydsReturn: 0 }),
				ev("touchbackInt"),
			]),
			{ type: "touchback" },
		);
	});

	test("carry yards add up across the whole play; sacks and kick distance don't count", () => {
		const play = (carryYds: number, returnYds: number): PlayOutcome => ({
			type: "play",
			carryYds,
			returnYds,
		});

		// Catch, fumble, recovered and run back the other way: one play, both carries
		assert.deepStrictEqual(
			playOutcome([
				ev("dropback"),
				ev("pss"),
				ev("pssCmp", { yds: 12 }),
				ev("fmb", { yds: 0 }),
				ev("fmbRec", { yds: -20 }),
			]),
			play(32, 0),
		);
		assert.deepStrictEqual(
			playOutcome([
				ev("dropback"),
				ev("pss"),
				ev("possessionChange", { yds: 25 }),
				ev("int", { ydsReturn: 35 }),
			]),
			play(35, 0),
		);
		assert.deepStrictEqual(playOutcome([ev("rus", { yds: -3 })]), play(3, 0));
		assert.deepStrictEqual(
			playOutcome([ev("dropback"), ev("sk", { yds: -7 })]),
			play(0, 0),
		);
		assert.deepStrictEqual(
			playOutcome([ev("dropback"), ev("pss"), ev("pssInc")]),
			play(0, 0),
		);
		assert.deepStrictEqual(
			playOutcome([
				ev("k", { kickTo: 5 }),
				ev("possessionChange", { yds: 0 }),
				ev("kr", { yds: 28 }),
			]),
			play(0, 28),
		);
		assert.deepStrictEqual(
			playOutcome([
				ev("p", { yds: 45 }),
				ev("possessionChange", { yds: 0 }),
				ev("pr", { yds: 9 }),
			]),
			play(0, 9),
		);
		assert.deepStrictEqual(
			playOutcome([
				ev("onsideKick", { kickTo: 45 }),
				ev("onsideKickRecovery", { yds: 3 }),
			]),
			play(0, 3),
		);
	});

	test("a field goal attempt is a normal-length play", () => {
		assert.deepStrictEqual(playOutcome([ev("fg")]), {
			type: "play",
			carryYds: 0,
			returnYds: 0,
		});
	});
});

describe("deadTime", () => {
	const deadDraws = (c: DeadTimeCase) =>
		Array.from({ length: N }, () => deadTime(c));

	// Targets come from DEAD_TIME, so tuning rounds don't touch these tests
	test("in bounds, out of bounds, changes of possession and penalties: Gaussian around their mean, clipped", () => {
		for (const c of [
			"inBounds",
			"outOfBounds",
			"possessionChange",
			"penalty",
		] as const) {
			const spec = DEAD_TIME[c];
			const xs = deadDraws(c);
			assert.ok(min(xs) >= spec.min, `${c} min ${min(xs)}`);
			assert.ok(max(xs) <= spec.max, `${c} max ${max(xs)}`);
			near(mean(xs), spec.mean, 0.15, `${c} mean`);
		}
	});

	test("the plan's starting shape: a 3.5s spread, clipped 8s below and 7s above the mean", () => {
		for (const c of [
			"inBounds",
			"outOfBounds",
			"possessionChange",
			"penalty",
		] as const) {
			const spec = DEAD_TIME[c];
			assert.strictEqual(spec.sd, 3.5, c);
			assert.strictEqual(spec.mean - spec.min, 8, c);
			assert.strictEqual(spec.max - spec.mean, 7, c);
		}
		// Out of bounds is the in-bounds huddle minus ~8s spotting the ball
		assert.strictEqual(DEAD_TIME.inBounds.mean - DEAD_TIME.outOfBounds.mean, 8);
		// Config K (2026-09-11): every mean 0.5s below the plan's 32 / 24 / 24 / 16
		assert.deepStrictEqual(
			[
				DEAD_TIME.inBounds.mean,
				DEAD_TIME.outOfBounds.mean,
				DEAD_TIME.possessionChange.mean,
				DEAD_TIME.penalty.mean,
			],
			[31.5, 23.5, 23.5, 15.5],
		);
	});

	test("a timeout right after the play: 0-2s", () => {
		const xs = deadDraws("timeout");
		assert.ok(min(xs) >= 0 && max(xs) <= 2, `${min(xs)}-${max(xs)}`);
		near(mean(xs), 1, 0.02, "mean");
	});

	test("hurry-up keeps the engine's 5-13s band until piece 4", () => {
		const xs = deadDraws("hurryUp");
		assert.ok(min(xs) >= 5 && max(xs) <= 13, `${min(xs)}-${max(xs)}`);
		assert.ok(xs.every((x) => Number.isInteger(x)));
	});

	test("nothing else charges dead time", () => {
		assert.strictEqual(deadTime("none"), 0);
	});
});

describe("deadTimeCase", () => {
	const base = {
		kneel: false,
		twoMinuteWarning: false,
		timeout: false,
		scoredOrTry: false,
		penalty: false,
		touchback: false,
		possessionChange: false,
		onsideRecovered: false,
		incompletion: false,
		outOfBounds: false,
		clockRunning: false,
		lateWindow: false,
		penaltyDeadTimeInLateWindows: true,
	};
	const kase = (
		overrides: Partial<typeof base>,
		hurryUp: () => boolean = () => false,
	) => deadTimeCase({ ...base, ...overrides, hurryUp });

	test("in bounds with the clock running: the normal huddle, or hurry-up", () => {
		assert.strictEqual(kase({ clockRunning: true }), "inBounds");
		assert.strictEqual(
			kase({ clockRunning: true }, () => true),
			"hurryUp",
		);
	});

	test("out of bounds restarts on the spot, except inside the late windows", () => {
		assert.strictEqual(kase({ outOfBounds: true }), "outOfBounds");
		assert.strictEqual(kase({ outOfBounds: true, lateWindow: true }), "none");
	});

	test("a change of possession is like out of bounds, late windows included", () => {
		assert.strictEqual(kase({ possessionChange: true }), "possessionChange");
		assert.strictEqual(
			kase({ possessionChange: true, lateWindow: true }),
			"none",
		);
	});

	test("penalties get their own dead time, late windows included", () => {
		assert.strictEqual(kase({ penalty: true }), "penalty");
		assert.strictEqual(kase({ penalty: true, lateWindow: true }), "penalty");
		assert.strictEqual(kase({ penalty: true, incompletion: true }), "penalty");
		assert.strictEqual(kase({ penalty: true, outOfBounds: true }), "penalty");
		assert.strictEqual(
			kase({ penalty: true, possessionChange: true }),
			"penalty",
		);
	});

	test("incompletions, scores, touchbacks, kneels and the two-minute warning charge nothing", () => {
		for (const flag of [
			"incompletion",
			"scoredOrTry",
			"touchback",
			"kneel",
			"twoMinuteWarning",
		] as const) {
			assert.strictEqual(kase({ [flag]: true }), "none", flag);
		}
		// A score stands even when a flag was thrown
		assert.strictEqual(kase({ scoredOrTry: true, penalty: true }), "none");
		// A touchback on a change of possession
		assert.strictEqual(
			kase({ touchback: true, possessionChange: true }),
			"none",
		);
	});

	test("a switch makes penalties stop the clock outright inside the late windows too", () => {
		const off = { penaltyDeadTimeInLateWindows: false };
		assert.strictEqual(
			kase({ penalty: true, lateWindow: true, ...off }),
			"none",
		);
		assert.strictEqual(kase({ penalty: true, ...off }), "penalty");
		// Approved 2026-09-11: penalties stop the clock outright inside the late
		// windows, like out of bounds
		assert.strictEqual(LATE_WINDOW_RULES.penaltyDeadTime, false);
	});

	test("a timeout right after the play", () => {
		assert.strictEqual(kase({ timeout: true, clockRunning: true }), "timeout");
	});

	test("an onside kick the kicking team recovers is timed like an in-bounds play", () => {
		assert.strictEqual(kase({ onsideRecovered: true }), "inBounds");
	});

	test("hurry-up is only checked when the clock is still running", () => {
		let checked = false;
		const hurryUp = () => {
			checked = true;
			return true;
		};
		assert.strictEqual(kase({ outOfBounds: true }, hurryUp), "outOfBounds");
		assert.strictEqual(kase({ penalty: true }, hurryUp), "penalty");
		assert.strictEqual(checked, false);
	});
});
