import { assert, test } from "vitest";
import invertDepth from "./invertDepth.football.ts";
import type { Position } from "../../../common/types.football.ts";

// A depth array holds the whole roster, so these fixtures deliberately mix
// out-of-position players into each list.
const posByPid = new Map<number, Position>([
	[1, "DL"],
	[2, "DL"],
	[3, "DL"],
	[4, "DL"],
	[5, "LB"],
	[6, "K"],
	[7, "QB"],
	[8, "QB"],
]);

test("reverses the players who actually play the position", () => {
	const output = invertDepth({ DL: [1, 2, 3, 4] }, posByPid);
	assert.deepStrictEqual(output.DL, [4, 3, 2, 1]);
});

test("leaves out-of-position players in their original slots", () => {
	// The LB sits second and the kicker last; only the four DL should move.
	const output = invertDepth({ DL: [1, 5, 2, 3, 4, 6] }, posByPid);
	assert.deepStrictEqual(output.DL, [4, 5, 3, 2, 1, 6]);
});

test("never promotes an out-of-position player", () => {
	// The regression this function exists to prevent: a kicker at defensive
	// tackle. Whichever slots held a natural DL before must still hold one.
	const input = [6, 1, 5, 2, 3, 4];
	const output = invertDepth({ DL: input }, posByPid)!.DL!;

	for (const [i, pid] of input.entries()) {
		assert.strictEqual(
			posByPid.get(output[i]!) === "DL",
			posByPid.get(pid) === "DL",
			`slot ${i} changed between natural and out-of-position`,
		);
	}
});

test("handles thin and empty position groups", () => {
	const output = invertDepth({ QB: [7], DL: [], LB: [5, 1] }, posByPid);
	assert.deepStrictEqual(output.QB, [7]);
	assert.deepStrictEqual(output.DL, []);

	// Only one natural LB here, so nothing can move.
	assert.deepStrictEqual(output.LB, [5, 1]);
});

test("leaves K and P alone", () => {
	const output = invertDepth({ K: [6, 1, 2], P: [1, 2] }, posByPid);
	assert.deepStrictEqual(output.K, [6, 1, 2]);
	assert.deepStrictEqual(output.P, [1, 2]);
});

test("does not mutate its input", () => {
	const depth = { DL: [1, 2, 3, 4], QB: [7, 8] };
	const before = structuredClone(depth);
	invertDepth(depth, posByPid);
	assert.deepStrictEqual(depth, before);
});

test("passes through positions it does not know", () => {
	// KR/PR are never anyone's natural position, so they are left as-is.
	const output = invertDepth({ KR: [1, 2, 3] }, posByPid);
	assert.deepStrictEqual(output.KR, [1, 2, 3]);
});
