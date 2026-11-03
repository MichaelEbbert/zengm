import { afterEach, assert, describe, test, vi } from "vitest";
import {
	RUSH_TUNING,
	DESPERATION_TUNING,
	FOURTH_DOWN_TUNING,
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

describe("fourthDownDecision, FOURTH_DOWN_TUNING", () => {
	const defaults = { ...FOURTH_DOWN_TUNING };

	afterEach(() => {
		Object.assign(FOURTH_DOWN_TUNING, defaults);
	});

	const decide = ({
		toGo = 2,
		scrimmage = 53,
		fgProbability = 0.1,
		quarter = 3,
		scoreDiff = 10,
		clock = 12,
		mode = "normal",
	}: {
		toGo?: number;
		scrimmage?: number;
		fgProbability?: number;
		quarter?: number;
		scoreDiff?: number;
		clock?: number;
		mode?: "normal" | "desperation" | "protection";
	}) =>
		fourthDownDecision(
			toGo,
			scrimmage,
			true,
			true,
			fgProbability,
			quarter,
			scoreDiff,
			clock,
			mode,
			10,
			20,
		);

	test("defaults keep the original calls, except in the 0.40-0.45 window", () => {
		assert.strictEqual(decide({}), "run");
		assert.strictEqual(decide({ toGo: 1, scrimmage: 45 }), "run");
		assert.strictEqual(decide({ toGo: 3, scrimmage: 58 }), "run");
		assert.strictEqual(
			decide({ toGo: 3, scrimmage: 58, fgProbability: 0.42 }),
			"run",
		);
		assert.strictEqual(
			decide({ toGo: 4, scrimmage: 58, fgProbability: 0.42 }),
			"punt",
		);
		assert.strictEqual(
			decide({ mode: "protection", fgProbability: 0.42 }),
			"fieldGoal",
		);
	});

	test("the lead rule punts only at the lead, quarter and yard lines it names", () => {
		FOURTH_DOWN_TUNING.leadPuntMinLead = 9;
		FOURTH_DOWN_TUNING.leadPuntFromQuarter = 3;

		assert.strictEqual(decide({}), "punt");
		assert.strictEqual(decide({ toGo: 1, scrimmage: 45 }), "punt");
		assert.strictEqual(decide({ scoreDiff: 8 }), "run");
		assert.strictEqual(decide({ quarter: 2 }), "run");
		assert.strictEqual(decide({ toGo: 3, scrimmage: 58 }), "run");

		FOURTH_DOWN_TUNING.leadPuntMaxScrimmage = 60;
		assert.strictEqual(decide({ toGo: 3, scrimmage: 58 }), "punt");
	});

	test("the lead rule leaves field goals alone", () => {
		FOURTH_DOWN_TUNING.leadPuntMinLead = 9;
		assert.strictEqual(decide({ fgProbability: 0.5 }), "fieldGoal");
	});

	test("protection mode's field goal bar", () => {
		FOURTH_DOWN_TUNING.protectionFgMinProbability = 0.65;
		assert.strictEqual(
			decide({ mode: "protection", fgProbability: 0.64 }),
			"punt",
		);
		assert.strictEqual(
			decide({ mode: "protection", fgProbability: 0.65 }),
			"fieldGoal",
		);
	});

	test("protection mode punts by default and can use the field-position table", () => {
		const protection = {
			mode: "protection",
			scoreDiff: 6,
			quarter: 4,
		} as const;
		assert.strictEqual(decide({ ...protection, clock: 5 }), "punt");

		FOURTH_DOWN_TUNING.protectionUsesTable = true;
		assert.strictEqual(decide({ ...protection, clock: 5 }), "run");
		assert.strictEqual(
			decide({ ...protection, clock: 5, toGo: 3, scrimmage: 45 }),
			"punt",
		);
		assert.strictEqual(
			decide({ ...protection, clock: 5, toGo: 2, fgProbability: 0.42 }),
			"fieldGoal",
		);
	});

	test("fgWindowUsesTable: false restores the old always-punt window", () => {
		FOURTH_DOWN_TUNING.fgWindowUsesTable = false;
		assert.strictEqual(
			decide({ toGo: 3, scrimmage: 58, fgProbability: 0.42 }),
			"punt",
		);
		assert.strictEqual(
			decide({ toGo: 2, scrimmage: 58, fgProbability: 0.42 }),
			"run",
		);
	});
});

describe("playDecision, DESPERATION_TUNING", () => {
	afterEach(() => {
		DESPERATION_TUNING.playCalls = "closeGame";
		vi.restoreAllMocks();
	});

	// 2nd and 4 in desperation mode, Q4 with 3:00 left
	const call = (scrimmage: number, scoreDiff: number, clock = 3) =>
		playDecision(
			2,
			4,
			scrimmage,
			10,
			40,
			10,
			60,
			6,
			4,
			clock,
			"desperation",
			scoreDiff,
		);

	test("closeGame (default) calls normally down 3 or less, passes down 4+", () => {
		assert.strictEqual(call(40, -3), "run");
		assert.strictEqual(call(40, -4), "pass");
	});

	test("closeGame goes back to passHeavy under 1:06", () => {
		assert.strictEqual(call(40, -3, 1.1), "run");
		assert.strictEqual(call(40, -3, 1), "pass");
	});

	test("passHeavy passes on 2nd and 4", () => {
		DESPERATION_TUNING.playCalls = "passHeavy";
		assert.strictEqual(call(40, -7), "pass");
		assert.strictEqual(call(70, -3), "pass");
	});

	test("normal uses the normal-mode rule: run on 2nd and 4", () => {
		DESPERATION_TUNING.playCalls = "normal";
		assert.strictEqual(call(40, -7), "run");
	});

	test("fgRange only applies down 3 or less, at the opp 35 or closer, 1:00+ left", () => {
		DESPERATION_TUNING.playCalls = "fgRange";
		assert.strictEqual(call(70, -3), "run");
		assert.strictEqual(call(70, -4), "pass");
		assert.strictEqual(call(60, -3), "pass");
		assert.strictEqual(call(70, -3, 0.5), "pass");
	});
});

describe("playDecision, RUSH_TUNING", () => {
	afterEach(() => {
		RUSH_TUNING.runBoost = 0;
		vi.restoreAllMocks();
	});

	// 6.0 ypc vs 4.0 ypa: a 60% run share before any boost
	const call = () => firstDown(10, [10, 10], { rushYards: 60, passYards: 40 });

	test("no boost: run below 0.60", () => {
		rollBelow(0.59);
		assert.strictEqual(call(), "run");
		rollBelow(0.61);
		assert.strictEqual(call(), "pass");
	});

	test("a 0.10 boost makes it 0.70", () => {
		RUSH_TUNING.runBoost = 0.1;
		rollBelow(0.69);
		assert.strictEqual(call(), "run");
		rollBelow(0.71);
		assert.strictEqual(call(), "pass");
	});

	test("the boost is capped at 0.90", () => {
		RUSH_TUNING.runBoost = 0.5;
		rollBelow(0.89);
		assert.strictEqual(call(), "run");
		rollBelow(0.91);
		assert.strictEqual(call(), "pass");
	});
});
