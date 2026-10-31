import { assert, beforeAll, beforeEach, describe, test } from "vitest";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player } from "../core/index.ts";
import { g } from "../util/index.ts";
import { idb } from "./index.ts";
import type { Player } from "../../common/types.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";

beforeAll(async () => {
	resetG();

	await resetCache({
		players: [player.generate(g.get("userTid"), 30, 2017, true, DEFAULT_LEVEL)],
	});
});
beforeEach(() => {
	idb.cache._status = "full";
});

describe("_hasPendingWrites", () => {
	test("sees dirty records and deletes, including stores outside of STORES", () => {
		// Setting up the test cache leaves writes pending
		for (const set of [
			...Object.values(idb.cache._dirtyRecords),
			...Object.values(idb.cache._deletes),
		]) {
			set.clear();
		}
		assert.isFalse(idb.cache._hasPendingWrites());

		idb.cache._dirtyRecords.players.add(1);
		assert.isTrue(idb.cache._hasPendingWrites());
		idb.cache._dirtyRecords.players.clear();

		idb.cache._deletes.events.add(1);
		assert.isTrue(idb.cache._hasPendingWrites());
		idb.cache._deletes.events.clear();

		assert.isFalse(idb.cache._hasPendingWrites());
	});
});

describe("get", () => {
	test("retrieve an object", async () => {
		const p = (await idb.cache.players.getAll())[0]!;
		const p2 = (await idb.cache.players.get(p.pid)) as Player;
		assert.strictEqual(p.pid, p2.pid);
	});

	test("return undefined for invalid ID", async () => {
		const p = await idb.cache.players.get(-1);
		assert.strictEqual(p, undefined);
	});

	test("wait until filling complete before resolving query", async () => {
		const p = (await idb.cache.players.getAll())[0]!;

		idb.cache._status = "filling";
		let setTimeoutCalled = false;
		setTimeout(() => {
			setTimeoutCalled = true;
			idb.cache._setStatus("full");
		}, 1000);

		const p2 = (await idb.cache.players.get(p.pid)) as Player;
		assert(setTimeoutCalled);
		assert.strictEqual(idb.cache._status, "full");
		assert.strictEqual(p.pid, p2.pid);
	});
});
