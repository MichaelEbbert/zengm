// Fit QB ovr to the engine's own ovr distribution (user, 2026-10-14).
// Each rating matches the engine on its own, but real QBs are good at
// everything at once, so ovr came out far wider than the engine's (24 QBs at
// 80+ vs ~2). Keep the ovr ORDER; give the QB at percentile p the engine QB
// ovr at percentile p; reach it by moving his ratings:
//   - normal ratings (tha thp thv bsc elu) move toward the engine QB mean
//   - stre moves 3x as fast and only DOWN (its ovr weight is mostly the
//     athleticism composite, which the game sim never uses)
//   - spd moves 2x and only down for pocket passers; runners (engine 80th
//     pct+ in spd or elu) get the normal rate toward the mean
//   - never below the engine's minimum for a rating; never past the mean
//   - hgt (a real measurement) and endu (not in QB ovr) are not touched;
//     pinned ratings are not touched
// A single factor t in [0,1] is searched per QB so ovr lands on the target.
// Pipeline: rateQb.cjs (each rating) -> seedQb.cjs -> THIS -> ovrPot.
//   REAL_DRAFT=1 [REAL_DRAFT_WRITE=1] SPORT=football npx vitest run \
//     --project football docs/real_draft_classes/scripts/fitOvr.football.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import ovr from "../../../src/worker/core/player/ovr.ts";
import compositeRating from "../../../src/worker/core/player/compositeRating.ts";
import { COMPOSITE_WEIGHTS } from "../../../src/common/constants.football.ts";

const WRITE = process.env.REAL_DRAFT_WRITE === "1";
// Position (2026-10-14 overnight: RB added). QB keeps every rule below; other
// positions order by engine ovr and move only their stat-based ratings.
const POS = process.env.REAL_DRAFT_POS ?? "QB";
// What sets the ORDER: "ovr" (engine QB ovr) or "game" -- passing 6 :
// scrambling 1 (user, 2026-10-14; 3:1 was tried and weighted mobility
// MORE than ovr does, which is ~9:2 incl. athleticism): ovr counts spd/stre twice via the
// athleticism composite, which the game sim never uses, so slow passers
// (Brady) ranked below mobile ones on paper.
const RANK = process.env.REAL_DRAFT_RANK ?? (POS === "QB" ? "game" : "ovr");
const comp = (r: any, name: string) => {
	const c = (COMPOSITE_WEIGHTS as any)[name];
	return compositeRating(r, c.ratings, c.weights, false);
};
const PASS_W = Number(process.env.REAL_DRAFT_PASSW ?? 6);
const gameKey = (r: any) =>
	(PASS_W *
		(comp(r, "passingAccuracy") +
			comp(r, "passingDeep") +
			comp(r, "passingVision"))) /
		3 +
	comp(r, "rushing");
const here = import.meta.dirname;
const classDir =
	process.env.REAL_DRAFT_CLASSES ??
	path.join(here, "..", "..", "..", "draft_classes");
const dataDir = path.join(here, "..", "data");

// user-approved pins: these ratings stay exactly as set
const PINNED: Record<string, string[]> = {
	"2016draft.json|Patrick Mahomes": ["thp"],
	"2019draft.json|Justin Herbert": ["thp"],
	"1978draft.json|Joe Montana": ["thp"],
	"2021draft.json|Brock Purdy": ["thp"],
	"2000draft.json|Michael Vick": ["spd", "elu"],
	"2017draft.json|Lamar Jackson": ["spd", "elu", "stre"],
	"1955draft.json|Bart Starr": ["spd"],
	"1999draft.json|Tom Brady": ["elu"],
	"2003draft.json|Ben Roethlisberger": ["stre"],
};
const NORMAL: Record<string, string[]> = {
	QB: ["tha", "thp", "thv", "bsc", "elu"],
	// RB: every stat-based rating in RB ovr moves toward the engine mean
	RB: ["spd", "elu", "stre", "bsc", "hnd", "rtr"],
};
const KEYS: Record<string, string[]> = {
	QB: ["tha", "thp", "thv", "bsc", "elu", "spd", "stre"],
	RB: ["spd", "elu", "stre", "bsc", "hnd", "rtr"],
};

const readEngine = () => {
	const lines = fs
		.readFileSync(
			path.join(dataDir, `${POS.toLowerCase()}draftratings.csv`),
			"utf8",
		)
		.trim()
		.split(/\r?\n/);
	const head = lines[0].split(",");
	return lines.slice(1).map((l) => {
		const v = l.split(",");
		return Object.fromEntries(head.map((h, i) => [h, Number(v[i])]));
	});
};

describe.skipIf(!process.env.REAL_DRAFT)("fit ovr", () => {
	test(POS, () => {
		const engine = readEngine();
		const stats = (k: string) => {
			const v = engine.map((r) => r[k]).sort((a, b) => a - b);
			return {
				min: v[0],
				mean: v.reduce((a, b) => a + b, 0) / v.length,
				p80: v[Math.floor(v.length * 0.8)],
			};
		};
		const S = Object.fromEntries(
			[...new Set([...KEYS[POS], "spd", "elu", "stre"])].map((k) => [
				k,
				stats(k),
			]),
		);
		const engineOvr = engine
			.map((r) => ovr(r as any, POS))
			.sort((a, b) => a - b);
		const ovrAt = (p: number) => {
			const x = p * (engineOvr.length - 1);
			const lo = Math.floor(x);
			return Math.round(
				engineOvr[lo] +
					(engineOvr[Math.min(lo + 1, engineOvr.length - 1)] - engineOvr[lo]) *
						(x - lo),
			);
		};

		const files = fs
			.readdirSync(classDir)
			.filter((f) => /^\d{4}draft\.json$/.test(f))
			.sort();
		const classes = Object.fromEntries(
			files.map((f) => [
				f,
				JSON.parse(fs.readFileSync(path.join(classDir, f), "utf8")),
			]),
		);
		const qbs: any[] = [];
		for (const f of files)
			for (const p of classes[f].players)
				if (p.ratings.at(-1).pos === POS)
					qbs.push({
						f,
						p,
						key: `${f}|${p.firstName} ${p.lastName}`,
						r: p.ratings.at(-1),
					});
		for (const q of qbs) q.ovr0 = ovr(q.r, POS);
		// order by current ovr (ties: sum of the ovr ratings)
		const tie = (q: any) =>
			[...KEYS[POS], "hgt"].reduce((a, k) => a + q.r[k], 0);
		for (const q of qbs) q.key0 = RANK === "game" ? gameKey(q.r) : q.ovr0;
		const sorted = [...qbs].sort(
			(a, b) => a.key0 - b.key0 || a.ovr0 - b.ovr0 || tie(a) - tie(b),
		);
		sorted.forEach((q, i) => (q.rank = sorted.length - i));
		sorted.forEach((q, i) => (q.target = ovrAt((i + 0.5) / sorted.length)));

		const moved = (q: any, t: number) => {
			const r = { ...q.r };
			const pinned = PINNED[q.key] ?? [];
			const runner = q.r.spd >= S.spd.p80 || q.r.elu >= S.elu.p80;
			const lower = q.target < q.ovr0;
			const toward = (k: string, mult: number, downOnly: boolean) => {
				if (pinned.includes(k)) return;
				if (downOnly && !lower) return; // only used to lower ovr
				// lowering ovr never raises a rating, raising never lowers one
				const goal = downOnly
					? S[k].min
					: lower
						? Math.min(S[k].mean, q.r[k])
						: Math.max(S[k].mean, q.r[k]);
				const f = Math.min(1, t * mult);
				r[k] = Math.round(q.r[k] + f * (goal - q.r[k]));
				r[k] = Math.max(S[k].min, r[k]);
			};
			for (const k of NORMAL[POS]) toward(k, 1, false);
			if (POS !== "QB") return r;
			if (lower) {
				toward("stre", 3, true);
				if (runner) toward("spd", 1, false);
				else toward("spd", 2, true);
			} else {
				toward("stre", 1, false);
				toward("spd", 1, false);
			}
			return r;
		};
		for (const q of qbs) {
			if (q.target === q.ovr0) {
				q.new = { ...q.r };
				continue;
			}
			// ovr moves monotonically with t: bisect for the closest fit
			let lo = 0;
			let hi = 1;
			for (let i = 0; i < 30; i++) {
				const mid = (lo + hi) / 2;
				const o = ovr(moved(q, mid) as any, POS);
				const past = q.target < q.ovr0 ? o <= q.target : o >= q.target;
				if (past) hi = mid;
				else lo = mid;
			}
			q.t = hi;
			q.new = moved(q, hi);
		}
		const keys = KEYS[POS];
		const rows = qbs.map((q) => {
			const o1 = ovr(q.new, POS);
			return {
				q,
				o1,
				line: [
					`"${q.key.split("|")[1]}"`,
					q.f,
					q.ovr0,
					q.target,
					o1,
					...keys.map((k) => `${q.r[k]}>${q.new[k]}`),
					q.rank,
				].join(","),
			};
		});
		rows.sort((a, b) => a.q.rank - b.q.rank);
		fs.writeFileSync(
			path.join(dataDir, `${POS.toLowerCase()}_fit_ovr.csv`),
			`name,file,ovr_before,target,ovr_after,${keys.join(",")},rank\n${rows.map((x) => x.line).join("\n")}\n`,
		);
		if (WRITE) {
			for (const q of qbs)
				for (const r of q.p.ratings) for (const k of keys) r[k] = q.new[k];
			for (const f of files)
				fs.writeFileSync(path.join(classDir, f), JSON.stringify(classes[f]));
		}
	});
});
