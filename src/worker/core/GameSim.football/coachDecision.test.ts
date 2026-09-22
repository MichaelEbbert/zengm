import { afterEach, assert, describe, test, vi } from "vitest";
import {
	determineMode,
	fourthDownDecision,
	playDecision,
} from "./coachDecision.ts";

// playDecision in normal mode on 1st down, Q1 with 10:00 left
const firstDown = (
	toGo: number,
	[rushAttempts, passAttempts]: [number, number],
	{ rushYards = 4 * rushAttempts, passYards = 6 * passAttempts } = {},
) =>
	playDecision(
		1,
		toGo,
		25,
		rushAttempts,
		rushYards,
		passAttempts,
		passYards,
		Math.round(passAttempts * 0.6),
		1,
		10,
		"normal",
	);

const rollBelow = (x: number) => vi.spyOn(Math, "random").mockReturnValue(x);

describe("playDecision, 1st down before the 5 + 5 threshold", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("1st and 6-10: 75% run, 25% pass", () => {
		for (const toGo of [6, 8, 10]) {
			for (const banked of [
				[0, 0],
				[4, 9],
				[9, 4],
			] as [number, number][]) {
				rollBelow(0.24);
				assert.strictEqual(firstDown(toGo, banked), "pass", `1st & ${toGo}`);
				rollBelow(0.25);
				assert.strictEqual(firstDown(toGo, banked), "run", `1st & ${toGo}`);
			}
		}
	});

	test("1st and 5 or less: always run", () => {
		rollBelow(0);
		for (const toGo of [1, 3, 5]) {
			assert.strictEqual(firstDown(toGo, [0, 0]), "run", `1st & ${toGo}`);
			assert.strictEqual(firstDown(toGo, [4, 9]), "run", `1st & ${toGo}`);
		}
	});

	test("1st and 11+ still always passes", () => {
		rollBelow(0.99);
		assert.strictEqual(firstDown(15, [0, 0]), "pass");
	});

	test("once the threshold is met, the YPC vs YPA ratio decides as before", () => {
		// 4 YPC vs 6 YPA: run 40% of the time
		rollBelow(0.39);
		assert.strictEqual(firstDown(10, [5, 5]), "run");
		assert.strictEqual(firstDown(3, [5, 5]), "run");
		rollBelow(0.41);
		assert.strictEqual(firstDown(10, [5, 5]), "pass");
		assert.strictEqual(firstDown(3, [5, 5]), "pass");
	});

	test("protection mode still runs every 1st down", () => {
		rollBelow(0);
		assert.strictEqual(
			playDecision(1, 10, 25, 0, 0, 0, 0, 0, 4, 5, "protection"),
			"run",
		);
	});
});

describe("fourthDownDecision, desperation mode", () => {
	// 4th and 4 at the opponent's 29 (scrimmage 71), Q4
	const fourthAndFour = (
		scoreDiff: number,
		clock: number,
		{ canKickFieldGoal = true, fgProbability = 0.6 } = {},
	) =>
		fourthDownDecision(
			4,
			71,
			true,
			canKickFieldGoal,
			fgProbability,
			4,
			scoreDiff,
			clock,
			determineMode(scoreDiff, 4, clock),
			0,
			0,
		);

	test("down 1-3 late and in range: kick the field goal", () => {
		for (const diff of [-1, -2, -3]) {
			assert.strictEqual(
				fourthAndFour(diff, 1.3),
				"fieldGoal",
				`down ${-diff}`,
			);
		}
	});

	test("down 1-3 late but out of range: still goes for it", () => {
		assert.strictEqual(
			fourthAndFour(-1, 1.3, { canKickFieldGoal: false }),
			"run",
		);
		assert.strictEqual(fourthAndFour(-1, 1.3, { fgProbability: 0.2 }), "run");
	});

	test("down 4+ late: a field goal doesn't tie, so go for it", () => {
		assert.strictEqual(fourthAndFour(-4, 1.3), "run");
	});
});
