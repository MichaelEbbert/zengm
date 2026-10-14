// Recompute ovr / pot (and ovrs, pots, skills, draft.ovr/pot/skills) for the
// real draft class files with the engine's own functions. On upload the
// engine keeps a file's stored ovr/pot when present (augmentPartialPlayer),
// so stale values would otherwise reach the league.
//   REAL_DRAFT=1 [REAL_DRAFT_POS=QB] [REAL_DRAFT_WRITE=1] SPORT=football \
//     npx vitest run --project football docs/real_draft_classes/scripts/ovrPot.football.test.ts
// Pot follows monteCarloPot for football: potEstimator(ovr, age, pos) plus a
// random -2..+2, never below ovr, capped at 100 -- here the random part is seeded per player
// so reruns give the same numbers. Writes data/<pos>_ovr_pot.csv; with
// REAL_DRAFT_WRITE=1 also the class files (compact JSON; run
// `npx oxfmt draft_classes` afterwards).
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "vitest";
import ovr from "../../../src/worker/core/player/ovr.ts";
import potEstimator from "../../../src/worker/core/player/potEstimator.ts";
import skills from "../../../src/worker/core/player/skills.ts";
import { POSITIONS } from "../../../src/common/constants.football.ts";

const POS = process.env.REAL_DRAFT_POS ?? "QB";
const WRITE = process.env.REAL_DRAFT_WRITE === "1";
const root = path.join(import.meta.dirname, "..", "..", "..");
const classDir =
	process.env.REAL_DRAFT_CLASSES ?? path.join(root, "draft_classes");
const dataDir = path.join(import.meta.dirname, "..", "data");

// FNV-1a -> integer in [-2, 2]
const wiggle = (key: string) => {
	let h = 2166136261;
	for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return ((h >>> 0) % 5) - 2;
};

describe.skipIf(!process.env.REAL_DRAFT)("real draft classes", () => {
	test(`ovr/pot for ${POS}`, () => {
		const rows: string[] = [];
		for (const f of fs
			.readdirSync(classDir)
			.filter((f) => /^\d{4}draft\.json$/.test(f))
			.sort()) {
			const file = path.join(classDir, f);
			const d = JSON.parse(fs.readFileSync(file, "utf8"));
			let changed = false;
			for (const p of d.players) {
				const r = p.ratings.at(-1);
				if (r.pos !== POS) continue;
				const name = `${p.firstName} ${p.lastName}`;
				for (const rr of p.ratings) {
					const age = rr.season - p.born.year;
					const ovrs: Record<string, number> = {};
					const pots: Record<string, number> = {};
					for (const pos of POSITIONS) {
						ovrs[pos] = ovr(rr, pos);
						const est =
							Math.round(potEstimator(ovrs[pos], age, pos)) +
							wiggle(`${f}|${name}|${pos}`);
						// as monteCarloPot: never below ovr, else bounded 0-100
						pots[pos] =
							ovrs[pos] > est ? ovrs[pos] : Math.max(0, Math.min(100, est));
					}
					const oldOvr = rr.ovr;
					const oldPot = rr.pot;
					rr.ovrs = ovrs;
					rr.pots = pots;
					rr.ovr = ovrs[rr.pos];
					rr.pot = pots[rr.pos];
					rr.skills = skills(rr);
					if (rr.season === p.draft.year) {
						p.draft.ovr = rr.ovr;
						p.draft.pot = rr.pot;
						p.draft.skills = rr.skills;
					}
					if (rr === r)
						rows.push(
							[
								`"${name}"`,
								f,
								age,
								rr.ovr,
								rr.pot,
								oldOvr,
								oldPot,
								rr.skills.join(" "),
							].join(","),
						);
				}
				changed = true;
			}
			if (WRITE && changed) fs.writeFileSync(file, JSON.stringify(d));
		}
		rows.sort((a, b) => Number(b.split(",")[3]) - Number(a.split(",")[3]));
		fs.writeFileSync(
			path.join(dataDir, `${POS.toLowerCase()}_ovr_pot.csv`),
			`name,file,age,ovr,pot,old_ovr,old_pot,skills\n${rows.join("\n")}\n`,
		);
		console.log(`${POS}: ${rows.length} players${WRITE ? ", written" : ""}`);
	});
});
