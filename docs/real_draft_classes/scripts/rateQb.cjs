// Rate one QB attribute from career passing stats vs league, on a bell curve
// (see real_draft_classes.md, "Quarterbacks -- rating-by-rating plan").
//   node rateQb.cjs --rating tha|thp|thv|bsc|spd|elu|stre|endu|hgt [--k K] [--mean M] [--sd S]
//                   [--size W] [--nocareer 0.25] [--write] [--write-size]
// Reads data/pfr_passing.csv (+ data/pfr_qb_size.csv for --size) and every
// draft_classes/*draft.json, writes data/qb_<rating>.csv (one row per QB).
// --write puts the rating into the class files, --write-size the real
// height/weight from PFR (compact JSON; run `npx oxfmt draft_classes` after).
const fs = require("fs");
const path = require("path");

const arg = (name, def) => {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : def;
};
// A rating blends one or more parts. Per part and season: stat = num / den *
// scale, z-scored against that season's league (avg pooled, SD between
// passers); sign -1 = lower is better. Seasons weigh by, and careers shrink
// on, the part's denominator (k is in those units): a yards-per-completion
// season on 3 completions is mostly noise. Parts are standardized across QBs
// and blended by w (a QB missing a part, e.g. no sack data before 1960, is
// blended from the parts he has).
// mean/sd: the engine's draft-time QB distribution (data/qbdraftratings.csv).
// floor: the engine's lowest draft-time value for that rating -- the curve's
// bottom tail is cut there (user, 2026-10-13: a bust is bad, not absurd).
// Ask the user before using a floor above 40.
// size: share of the score from real height + weight (user, 2026-10-13).
const STATS = {
	tha: {
		label: "cmp_pct",
		mean: 55.4,
		sd: 14.5,
		floor: 18,
		size: 0,
		parts: [{ num: "cmp", den: "att", scale: 100, sign: 1, w: 1, k: 400 }],
	},
	thp: {
		label: "yds_per_cmp",
		mean: 56.7,
		sd: 13.9,
		floor: 17,
		size: 0.2,
		parts: [{ num: "yds", den: "cmp", scale: 1, sign: 1, w: 1, k: 240 }],
	},
	// 2026-10-13: INT 50 / TD 30 / sacks 20 (user)
	thv: {
		label: "int_pct",
		mean: 38.6,
		sd: 12.9,
		floor: 14,
		size: 0,
		parts: [
			{ num: "int", den: "att", scale: 100, sign: -1, w: 0.5, k: 400 },
			{ num: "td", den: "att", scale: 100, sign: 1, w: 0.3, k: 400 },
			{ num: "sk", den: "dropbacks", scale: 100, sign: -1, w: 0.2, k: 400 },
		],
	},
	// 2026-10-13: fumbles per play handled (passes + sacks + rushes), lower
	// better (user). Fumbles are rare (~1 in 100 plays), so the shrink is
	// stronger than for the passing rates.
	bsc: {
		label: "fmb_per_100",
		mean: 31.6,
		sd: 13.3,
		floor: 7,
		size: 0,
		parts: [{ num: "fmb", den: "plays", scale: 100, sign: -1, w: 1, k: 1000 }],
	},
	// 2026-10-13: Combine 40 time 60% + rushing yards per carry 40% (user).
	// A "static" part is one measurement per player (no seasons, no shrink),
	// z-scored among the QBs who have it; a QB with a 40 time but no career
	// is rated from it (user) instead of joining the no-career block.
	spd: {
		label: "forty",
		mean: 46.5,
		sd: 14.7,
		floor: 8,
		size: 0,
		parts: [
			{ static: "forty", sign: -1, w: 0.6 },
			// minDen: carries a season needs to count toward the league SD
			{
				num: "rushYds",
				den: "rushAtt",
				scale: 1,
				sign: 1,
				w: 0.4,
				k: 100,
				minDen: 20,
			},
		],
	},
	// 2026-10-13 (user): run volume 40% + run success 30% + escaping
	// pressure 30%; a QB with no first-down data (before ~1978) is rated
	// 60% volume / 40% sack rate. No Combine drills.
	elu: {
		label: "rush_per_g",
		mean: 24.8,
		sd: 14.3,
		floor: 3,
		size: 0,
		parts: [
			{
				num: "rushAtt",
				den: "games",
				scale: 1,
				sign: 1,
				w: 0.4,
				k: 16,
				minDen: 8,
			},
			// minN: under 100 carries with first-down data, the part is ignored and
			// the QB gets the fallback weights (user, 2026-10-13: Tarkenton's
			// first downs are 2 seasons at 37-38)
			{
				num: "rushFd",
				den: "rushAttFd",
				scale: 100,
				sign: 1,
				w: 0.3,
				k: 100,
				minDen: 20,
				minN: 100,
			},
			{ num: "sk", den: "dropbacks", scale: 100, sign: -1, w: 0.3, k: 400 },
		],
		// weights when a QB has no data for part 1 (first downs)
		fallbackW: { 1: [0.6, 0, 0.4] },
	},
	// 2026-10-13 (user): short-yardage rushing TDs, weight, height, in that
	// order; no sack resistance. Body parts are "rates: false": they don't
	// lift a no-career QB out of the no-career block, they spread him around
	// it (as size does for thp).
	stre: {
		label: "rush_td_pct",
		mean: 14.6,
		sd: 9.5,
		floor: 0,
		size: 0,
		// map ranks onto the engine's own QB values, not a bell curve: the
		// engine's stre is lopsided against 0 (3.4% exactly 0), and the bell
		// curve put 9% of real QBs at 0 (user, 2026-10-13)
		empirical: true,
		parts: [
			{
				num: "rushTd",
				den: "rushAtt",
				scale: 100,
				sign: 1,
				w: 0.5,
				k: 150,
				minDen: 20,
			},
			// era: compared with QBs of the same draft decade (1950s QBs averaged
			// 198 lb, 2000s 224)
			{ static: "weight", sign: 1, w: 0.4, rates: false, era: true },
			{ static: "height", sign: 1, w: 0.1, rates: false, era: true },
		],
	},
	// 2026-10-13 (user): endu does almost nothing for a QB (no rotation, not
	// in QB ovr, not tied to injuries) and the engine's QB endu is unrelated
	// to his other ratings; derived from stre 35% + weight 25% + career
	// length 40% (first to last NFL season; QBs active in the latest season
	// get at least the average finished career). Mapped onto the engine's
	// own QB values.
	endu: {
		label: "career_yrs",
		mean: 33.5,
		sd: 14.3,
		floor: 1,
		size: 0,
		empirical: true,
		parts: [
			// noBody: not used to spread no-career QBs (they have no career, and
			// their stre is already their no-career value)
			{ static: "careerYears", sign: 1, w: 0.4, rates: false, noBody: true },
			{ static: "stre", sign: 1, w: 0.35, rates: false, noBody: true },
			{ static: "weight", sign: 1, w: 0.25, rates: false, era: true },
		],
	},
	// 2026-10-14 (user): real height on the engine's QB curve. Height is a
	// measurement, so every QB with a known height is rated from it; the 71
	// with no known height sit in the middle (noCareer 0.5), not low.
	hgt: {
		label: "height_in",
		mean: 49.2,
		sd: 13.5,
		floor: 14,
		size: 0,
		noCareer: 0.5,
		parts: [{ static: "height", sign: 1, w: 1 }],
	},
};
const RATING = arg("rating", "tha");
const STAT = STATS[RATING];
if (!STAT) throw new Error(`unknown --rating ${RATING}`);
const PARTS = STAT.parts.map((pt) =>
	pt.static ? pt : { ...pt, k: Number(arg("k", pt.k)) },
); // shrink: z * n / (n + k)
const SEASON_PARTS = PARTS.filter((pt) => !pt.static);
const MEAN = Number(arg("mean", STAT.mean));
const SD = Number(arg("sd", STAT.sd));
if (!(MEAN > 0 && SD > 0))
	throw new Error(`no curve for ${RATING}: pass --mean and --sd`);
const SIZE_W = Number(arg("size", STAT.size));
const FLOOR = Number(arg("floor", STAT.floor ?? 0));
if (FLOOR > 40 && !process.argv.includes("--floor-ok"))
	throw new Error(`floor ${FLOOR} > 40: ask the user, then pass --floor-ok`);
const NO_CAREER_PCT = Number(arg("nocareer", STAT.noCareer ?? 0.25));
// Under MIN_ATT career attempts = no career, for every passing rating (user,
// 2026-10-13): a handful of passes says nothing, and the shrink would pull
// them up toward the starter-heavy league average.
const MIN_ATT = Number(arg("minatt", 50));
// Recent classes haven't had their chance yet: their no-career QBs are
// scattered around the no-career value instead of all sitting on it --
// normal, SD = RECENT_SPREAD * curve SD, cut at +/-1 curve SD. Seeded per
// player + rating, so reruns give the same numbers.
const RECENT_FROM = Number(arg("recent", 2022)); // file year = real draft - 1
const RECENT_SPREAD = 0.5;
const MIN_ATT_SD = 100; // passers counted in a season's SD
const WRITE = process.argv.includes("--write");
const WRITE_SIZE = process.argv.includes("--write-size");

const root = path.join(__dirname, "..", "..", "..");
const dataDir = path.join(__dirname, "..", "data");
const classDir =
	process.env.REAL_DRAFT_CLASSES ?? path.join(root, "draft_classes");

// --- CSV ---
const parseLine = (line) => {
	const out = [];
	let cur = "";
	let q = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (q) {
			if (c === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (c === '"') q = false;
			else cur += c;
		} else if (c === '"') q = true;
		else if (c === ",") {
			out.push(cur);
			cur = "";
		} else cur += c;
	}
	out.push(cur);
	return out;
};
const readCsv = (file) => {
	const lines = fs
		.readFileSync(path.join(dataDir, file), "utf8")
		.trim()
		.split(/\r?\n/);
	const head = parseLine(lines[0]);
	return lines.slice(1).map((l) => {
		const v = parseLine(l);
		return Object.fromEntries(head.map((h, i) => [h, v[i]]));
	});
};

// One row per player-season-league: prefer PFR's "2TM"/"3TM" total row.
const SUMMED = [
	"pass_cmp",
	"pass_att",
	"pass_yds",
	"pass_td",
	"pass_int",
	"pass_sacked",
];
const bySeason = new Map();
for (const r of readCsv("pfr_passing.csv")) {
	const key = `${r.season}|${r.league}|${r.id || r.name_display}`;
	const isTotal = /^\dTM$/.test(r.team_name_abbr);
	const prev = bySeason.get(key);
	if (!prev || (isTotal && !prev.isTotal)) bySeason.set(key, { ...r, isTotal });
	else if (!isTotal && !prev.isTotal) {
		// no total row: sum the team rows
		for (const s of SUMMED)
			prev[s] =
				prev[s] === "" || r[s] === ""
					? ""
					: String(Number(prev[s] || 0) + Number(r[s] || 0));
	}
}
const seasons = [...bySeason.values()].map((r) => ({
	season: Number(r.season),
	league: r.league,
	id: r.id,
	name: r.name_display.replace(/[*+]/g, "").trim(),
	games: Number(r.games) || 0,
	cmp: Number(r.pass_cmp) || 0,
	att: Number(r.pass_att) || 0,
	yds: Number(r.pass_yds) || 0,
	td: Number(r.pass_td) || 0,
	int: Number(r.pass_int) || 0,
	// sacks blank (most seasons before 1960) = no sack data: dropbacks 0
	sk: r.pass_sacked === "" ? 0 : Number(r.pass_sacked),
	dropbacks:
		r.pass_sacked === ""
			? 0
			: (Number(r.pass_att) || 0) + Number(r.pass_sacked),
}));
// thp from 2018 on: completed air yards per completion (PFR advanced
// passing), so yards after the catch don't read as arm strength (user,
// 2026-10-13). Each season is still z-scored against its own league, so a
// career mixes both kinds of seasons cleanly.
const AIR_FROM = 2018;
if (RATING === "thp") {
	const air = new Map();
	for (const r of readCsv("pfr_air.csv")) {
		const key = `${r.season}|${r.id}`;
		const isTotal = /^\dTM$/.test(r.team);
		const prev = air.get(key);
		if (!prev || (isTotal && !prev.isTotal))
			air.set(key, { cmp: Number(r.cmp), yds: Number(r.air_yds), isTotal });
		else if (!isTotal && !prev.isTotal) {
			prev.cmp += Number(r.cmp);
			prev.yds += Number(r.air_yds);
		}
	}
	for (const s of seasons) {
		if (s.season < AIR_FROM || s.league !== "NFL") continue;
		const a = air.get(`${s.season}|${s.id}`);
		s.cmp = a ? a.cmp : 0; // no advanced row: the season doesn't count for thp
		s.yds = a ? a.yds : 0;
	}
}
const USES_CARRIES = SEASON_PARTS.some((pt) =>
	["rushYds", "rushAtt", "rushFd", "rushTd"].includes(pt.num),
);
// Rushing attempts and fumbles (PFR season rushing pages), joined on
// season + league + PFR id; a season with no rushing row had no rushes or
// fumbles recorded.
if (USES_CARRIES || SEASON_PARTS.some((pt) => pt.num === "fmb")) {
	const rush = new Map();
	for (const r of readCsv("pfr_rushing.csv")) {
		const key = `${r.season}|${r.league}|${r.id || r.name_display}`;
		const isTotal = /^\dTM$/.test(r.team_name_abbr);
		const prev = rush.get(key);
		const row = {
			att: Number(r.rush_att) || 0,
			yds: Number(r.rush_yds) || 0,
			td: Number(r.rush_td) || 0,
			fmb: Number(r.fumbles) || 0,
			isTotal,
		};
		if (!prev || (isTotal && !prev.isTotal)) rush.set(key, row);
		else if (!isTotal && !prev.isTotal) {
			prev.att += row.att;
			prev.yds += row.yds;
			prev.td += row.td;
			prev.fmb += row.fmb;
		}
	}
	for (const s of seasons) {
		const r = rush.get(`${s.season}|${s.league}|${s.id || s.name}`);
		s.rushAtt = r ? r.att : 0;
		s.rushYds = r ? r.yds : 0;
		s.rushTd = r ? r.td : 0;
		s.fmb = r ? r.fmb : 0;
		s.plays = s.att + s.sk + s.rushAtt;
	}
}
// Close-out plays (kneels and clock-killing sneaks) are QB carries that say
// nothing about running, and they dominate a winning pocket passer's line
// (Manning: 431 career carries, 1.55 YPC). Remove an estimate per win as a
// starter (PFR qb_rec) before yards per carry, by era (user, 2026-10-13).
// The first estimate (1.4 per win, 0.7 before 1979) removed most of a winning
// pocket passer's carries and left only his best scrambles (Manning 1.55 ->
// 5.50 YPC, spd 9 -> 59); half that rate matches reputations.
const CLOSE_OUTS = [
	{ from: 1990, perWin: 0.7, yds: -1.2 }, // kneels
	{ from: 1979, perWin: 0.7, yds: -0.3 }, // half kneels, half sneaks
	{ from: 0, perWin: 0.35, yds: 0.5 }, // sneaks; many teams handed off instead
];
const CLOSE_OUT_SCALE = Number(arg("closeout", 1)); // try other rates without editing the table
if (USES_CARRIES && fs.existsSync(path.join(dataDir, "pfr_qb_rec.csv"))) {
	const wins = new Map();
	for (const r of readCsv("pfr_qb_rec.csv")) {
		const key = `${r.season}|${r.league}|${r.id}`;
		const isTotal = /^\dTM$/.test(r.team);
		const w = Number(r.rec.split("-")[0]) || 0;
		const prev = wins.get(key);
		if (!prev || (isTotal && !prev.isTotal)) wins.set(key, { w, isTotal });
		else if (!isTotal && !prev.isTotal) prev.w += w;
	}
	for (const s of seasons) {
		const w = wins.get(`${s.season}|${s.league}|${s.id}`)?.w ?? 0;
		if (!w || !s.rushAtt) continue;
		const era = CLOSE_OUTS.find((e) => s.season >= e.from);
		const n = Math.min(s.rushAtt, w * era.perWin * CLOSE_OUT_SCALE);
		s.closeOuts = n;
		s.rushAtt -= n;
		s.rushYds -= n * era.yds;
	}
}
// Rushing first downs (PFR rushing pages; recorded from ~1978). rushAttFd =
// carries in seasons that have first-down data, so older seasons drop out of
// the success part instead of counting as zero.
if (SEASON_PARTS.some((pt) => pt.num === "rushFd")) {
	const fd = new Map();
	for (const r of readCsv("pfr_rush_fd.csv")) {
		const key = `${r.season}|${r.league}|${r.id}`;
		const isTotal = /^\dTM$/.test(r.team);
		const prev = fd.get(key);
		if (!prev || (isTotal && !prev.isTotal))
			fd.set(key, { fd: Number(r.fd) || 0, isTotal });
		else if (!isTotal && !prev.isTotal) prev.fd += Number(r.fd) || 0;
	}
	const fdFrom = Math.min(
		...[...fd.keys()].map((k) => Number(k.split("|")[0])),
	);
	for (const s of seasons) {
		const known = s.league === "NFL" && s.season >= fdFrom;
		s.rushFd = known ? (fd.get(`${s.season}|${s.league}|${s.id}`)?.fd ?? 0) : 0;
		s.rushAttFd = known ? s.rushAtt : 0;
	}
}
const value = (s, pt) => (s[pt.num] / s[pt.den]) * pt.scale;
const RUSH_NUMS = ["rushAtt", "rushYds", "rushFd", "rushTd"];

// League average (pooled) and SD (between passers with MIN_ATT_SD+ att), per part.
const lg = new Map();
for (const s of seasons) {
	const k = `${s.season}|${s.league}`;
	if (!lg.has(k))
		lg.set(
			k,
			PARTS.map(() => ({ num: 0, den: 0, vals: [] })),
		);
	PARTS.forEach((pt, i) => {
		if (pt.static) return;
		const L = lg.get(k)[i];
		// rushing parts: pool only real passers, or the running backs who threw
		// a pass or two swamp the league average (worst in the 1950s-60s)
		if (RUSH_NUMS.includes(pt.num) && s.att < MIN_ATT) return;
		L.num += s[pt.num];
		L.den += s[pt.den];
		if (s.att >= MIN_ATT_SD && s[pt.den] >= (pt.minDen ?? 1))
			L.vals.push(value(s, pt));
	});
}
for (const Ls of lg.values())
	PARTS.forEach((pt, i) => {
		const L = Ls[i];
		if (pt.static) return;
		L.avg = L.den ? (L.num / L.den) * pt.scale : NaN;
		const m = L.vals.reduce((a, b) => a + b, 0) / L.vals.length;
		L.sd = Math.sqrt(
			L.vals.reduce((a, b) => a + (b - m) ** 2, 0) / (L.vals.length - 1),
		);
		// too few qualified passers for an SD (e.g. sacks in 1955-59): skip the season
		if (!(L.sd > 0)) L.den = 0;
	});
const latest = [...lg.entries()]
	.filter(([k]) => k.endsWith("NFL"))
	.sort()
	.at(-1)[1][PARTS.findIndex((pt) => !pt.static)];

// Career per PFR id (or name for rows without one): per part, z weighted by
// the part's denominator.
const careers = new Map();
for (const s of seasons) {
	if (s.att === 0) continue;
	const key = s.id || `name:${s.name}`;
	if (!careers.has(key))
		careers.set(key, {
			id: s.id,
			name: s.name,
			first: s.season,
			last: s.season,
			att: 0,
			parts: PARTS.map(() => ({ num: 0, den: 0, zw: 0 })),
		});
	const c = careers.get(key);
	c.first = Math.min(c.first, s.season);
	c.last = Math.max(c.last, s.season);
	c.att += s.att;
	const Ls = lg.get(`${s.season}|${s.league}`);
	PARTS.forEach((pt, i) => {
		const L = Ls[i];
		if (pt.static || s[pt.den] === 0 || L.den === 0) return; // e.g. attempts but no completions for thp
		const cp = c.parts[i];
		cp.num += s[pt.num];
		cp.den += s[pt.den];
		cp.zw += ((value(s, pt) - L.avg) / L.sd) * s[pt.den];
	});
}
const norm = (n) =>
	n
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
		.replace(/[^a-z]/g, "");
const byName = new Map();
for (const c of careers.values()) {
	const k = norm(c.name);
	if (!byName.has(k)) byName.set(k, []);
	byName.get(k).push(c);
}
const byId = new Map(
	[...careers.values()].filter((c) => c.id).map((c) => [c.id, c]),
);

// Real height/weight from PFR player pages; "found" rows map a QB with no
// srID or passes ("realDraftYear|name") to his PFR id via the draft pages.
const sizeById = new Map();
const foundId = new Map();
if (fs.existsSync(path.join(dataDir, "pfr_qb_size.csv")))
	for (const r of readCsv("pfr_qb_size.csv")) {
		if (r.kind === "found") foundId.set(r.key, r.id);
		else if (r.hgt_in)
			sizeById.set(r.id, { hgt: Number(r.hgt_in), weight: Number(r.weight) });
	}

// Combine measurements (PFR, 1987+, QBs) by PFR id, or by "year|name" for
// players PFR has no page for; year = the real draft year.
const combine = new Map();
if (
	PARTS.some((pt) => pt.static) &&
	fs.existsSync(path.join(dataDir, "pfr_combine_qb.csv"))
)
	for (const r of readCsv("pfr_combine_qb.csv")) {
		const forty = Number(r.forty_yd) || null;
		const row = { forty };
		if (r.id) combine.set(r.id, row);
		combine.set(`${r.year}|${norm(r.player)}`, row);
	}
// 1987-1999 Combine (nflcombineresults.com; PFR's Combine pages start in
// 2000): no PFR ids, matched on draft year + name.
if (
	PARTS.some((pt) => pt.static) &&
	fs.existsSync(path.join(dataDir, "nflcombine_qb_1987_1999.csv"))
)
	for (const r of readCsv("nflcombine_qb_1987_1999.csv")) {
		const key = `${r.year}|${norm(r.player)}`;
		if (!combine.has(key))
			combine.set(key, { forty: Number(r.forty_yd) || null });
	}

// --- QBs in the class files ---
const files = fs
	.readdirSync(classDir)
	.filter((f) => /^\d{4}draft\.json$/.test(f))
	.sort();
const qbs = [];
const classes = {};
for (const f of files) {
	const d = JSON.parse(fs.readFileSync(path.join(classDir, f), "utf8"));
	classes[f] = d;
	const fileYear = Number(f.slice(0, 4));
	for (const p of d.players) {
		if (p.ratings.at(-1).pos !== "QB") continue;
		const name = `${p.firstName} ${p.lastName}`;
		let c = p.srID ? byId.get(p.srID) : undefined;
		let how = c ? "id" : "";
		if (!c) {
			// real draft is fileYear + 1; rookie season then or within 12 years (CFL, military)
			const cands = (byName.get(norm(name)) || []).filter(
				(x) => x.first >= fileYear + 1 && x.first <= fileYear + 13,
			);
			if (cands.length === 1) {
				c = cands[0];
				how = "name";
			} else if (cands.length > 1) how = "ambiguous";
		}
		const id = p.srID || c?.id || foundId.get(`${fileYear + 1}|${name}`) || "";
		const cmb =
			(id && combine.get(id)) || combine.get(`${fileYear + 1}|${norm(name)}`);
		qbs.push({ p, f, fileYear, name, c, how, id, size: sizeById.get(id), cmb });
	}
}

// --- score ---
const zOf = (xs) => {
	const m = xs.reduce((a, b) => a + b, 0) / xs.length;
	const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
	return (x) => (x - m) / sd;
};
const sized = qbs.filter((q) => q.size);
const zH = zOf(sized.map((q) => q.size.hgt));
const zW = zOf(sized.map((q) => q.size.weight));
for (const q of qbs)
	q.sizeRaw = q.size ? (zH(q.size.hgt) + zW(q.size.weight)) / 2 : null;
// Size compared within the QB's draft decade (user, 2026-10-14), like stre
// and endu: QBs gained ~26 lb and ~1.7 in from the 1950s to the 2000s, and
// "big arm" means big for his era. --size-abs = all QBs pooled (old way).
if (!process.argv.includes("--size-abs"))
	for (const d of new Set(sized.map((q) => Math.floor(q.fileYear / 10)))) {
		const g = sized.filter((q) => Math.floor(q.fileYear / 10) === d);
		const gh = zOf(g.map((q) => q.size.hgt));
		const gw = zOf(g.map((q) => q.size.weight));
		for (const q of g) q.sizeRaw = (gh(q.size.hgt) + gw(q.size.weight)) / 2;
	}
const zSize = zOf(sized.map((q) => q.sizeRaw));
for (const q of qbs) q.sizeZ = q.size ? zSize(q.sizeRaw) : 0; // unknown size = average

// Career length (endu): first to last season with a pass; QBs who played in
// the latest season are still going, so they get at least the average
// finished career.
{
	const lastSeason = Math.max(...seasons.map((s) => s.season));
	const span = (q) => q.c.last - q.c.first + 1;
	const finished = qbs.filter(
		(q) => q.c && q.c.att >= MIN_ATT && q.c.last < lastSeason,
	);
	const avgSpan = finished.reduce((a, q) => a + span(q), 0) / finished.length;
	for (const q of qbs)
		if (q.c && q.c.att >= MIN_ATT)
			q.careerYears =
				q.c.last === lastSeason ? Math.max(span(q), avgSpan) : span(q);
}
for (const q of qbs) {
	q.att = q.c ? q.c.att : 0;
	q.parts = PARTS.map((pt, i) => {
		if (pt.static) {
			const statics = {
				...q.cmb,
				weight: q.size?.weight,
				height: q.size?.hgt,
				stre: q.p.ratings.at(-1).stre,
				careerYears: q.careerYears,
			};
			const v = statics[pt.static] ?? null;
			return {
				n: v === null ? 0 : 1,
				stat: v,
				zRaw: 0,
				z: v === null ? 0 : pt.sign * v,
			};
		}
		const cp = q.c?.parts[i];
		const n = cp && cp.den >= (pt.minN ?? 0) ? cp.den : 0;
		const zRaw = n ? cp.zw / n : 0;
		return {
			n,
			stat: n ? (cp.num / n) * pt.scale : null,
			zRaw,
			z: n ? pt.sign * zRaw * (n / (n + pt.k)) : 0,
		};
	});
	q.n = q.parts[0].n;
	q.stat = q.parts[0].stat;
	q.zRaw = q.parts[0].zRaw;
	// a career = MIN_ATT+ pass attempts; a static part (40 time) also rates a QB
	q.career =
		q.att >= MIN_ATT &&
		(!SEASON_PARTS.length || PARTS.some((pt, i) => !pt.static && q.parts[i].n));
	q.measured = PARTS.some(
		(pt, i) => pt.static && pt.rates !== false && q.parts[i].n,
	);
}
// era static parts: z within the QB's draft decade before the usual blend
PARTS.forEach((pt, i) => {
	if (!pt.era) return;
	const decade = (q) => Math.floor(q.fileYear / 10);
	for (const d of new Set(qbs.map(decade))) {
		const group = qbs.filter((q) => decade(q) === d && q.parts[i].n);
		if (group.length < 2) continue;
		const z = zOf(group.map((q) => q.parts[i].z));
		for (const q of group) q.parts[i].z = z(q.parts[i].z);
	}
});
const played = qbs.filter((q) => q.career || q.measured);
const noCareer = qbs.filter((q) => !(q.career || q.measured));
const zPart = PARTS.map((pt, i) =>
	zOf(played.filter((q) => q.parts[i].n).map((q) => q.parts[i].z)),
);
for (const q of played) {
	let sum = 0;
	let wSum = 0;
	const missing = Object.keys(STAT.fallbackW ?? {}).find((i) => !q.parts[i].n);
	const ws =
		missing === undefined ? PARTS.map((pt) => pt.w) : STAT.fallbackW[missing];
	PARTS.forEach((pt, i) => {
		if (!q.parts[i].n || !ws[i]) return;
		if (!pt.static && !q.career) return; // a few passes say nothing
		sum += ws[i] * zPart[i](q.parts[i].z);
		wSum += ws[i];
	});
	q.z = sum / wSum;
}
for (const q of noCareer) q.z = 0;
// No-career spread from body parts (rates: false), weighted by their share:
// e.g. stre 50% body -> a no-career QB moves 0.5 SD per SD of body score.
const BODY = PARTS.map((pt, i) => [pt, i]).filter(
	([pt]) => pt.static && pt.rates === false && !pt.noBody,
);
const BODY_SHARE = BODY.reduce((a, [pt]) => a + pt.w, 0);
if (BODY.length) {
	const raw = (q) => {
		const have = BODY.filter(([, i]) => q.parts[i].n);
		if (!have.length) return null;
		return (
			have.reduce((a, [pt, i]) => a + pt.w * zPart[i](q.parts[i].z), 0) /
			have.reduce((a, [pt]) => a + pt.w, 0)
		);
	};
	const known = qbs.map(raw).filter((x) => x !== null);
	const zBody = zOf(known);
	for (const q of noCareer) {
		const r = raw(q);
		q.bodyZ = r === null ? 0 : zBody(r); // unknown size = average
	}
}
const zStat = zOf(played.map((q) => q.z));
for (const q of played) q.score = (1 - SIZE_W) * zStat(q.z) + SIZE_W * q.sizeZ;

// Acklam inverse normal CDF
const invNorm = (p) => {
	const a = [
		-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269,
		-30.66479806614716, 2.506628277459239,
	];
	const b = [
		-54.47609879822406, 161.5858368580409, -155.6989798598866,
		66.80131188771972, -13.28068155211218,
	];
	const c = [
		-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
		-2.549732539343734, 4.374664141464968, 2.938163982698783,
	];
	const d = [
		0.007784695709041462, 0.3224671290700398, 2.445134137142996,
		3.754408661907416,
	];
	const pl = 0.02425;
	if (p < pl) {
		const q = Math.sqrt(-2 * Math.log(p));
		return (
			(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
			((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
		);
	}
	if (p > 1 - pl) return -invNorm(1 - p);
	const q = p - 0.5;
	const r = q * q;
	return (
		((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
			q) /
		(((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
	);
};
const clamp = (v) => Math.max(FLOOR, Math.min(100, v));
// standard normal CDF (Abramowitz-Stegun 7.1.26 via erf)
const normCdf = (z) => {
	const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
	const erf =
		1 -
		((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
			t +
			0.254829592) *
			t *
			Math.exp(-(z * z) / 2);
	return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};
// Engine's draft-time values for this rating (data/qbdraftratings.csv):
// rank percentile p -> the engine QB value at percentile p.
const ENGINE = readCsv("qbdraftratings.csv")
	.map((r) => Number(r[RATING]))
	.filter((v) => !Number.isNaN(v))
	.sort((a, b) => a - b);
const curveAt = (p) => {
	const x = p * (ENGINE.length - 1);
	const lo = Math.floor(x);
	return (
		ENGINE[lo] +
		(ENGINE[Math.min(lo + 1, ENGINE.length - 1)] - ENGINE[lo]) * (x - lo)
	);
};
// Seeded standard normal: string hash -> mulberry32 -> Box-Muller
const gauss = (key) => {
	let h = 2166136261;
	for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	const rand = () => {
		h = (h + 0x6d2b79f5) | 0;
		let t = Math.imul(h ^ (h >>> 15), 1 | h);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
};
// Rank -> engine (user, 2026-10-14): the stat only decides the order; the
// QB ranked at percentile p gets the value of the engine-generated QB at
// percentile p (data/qbdraftratings.csv, every engine QB's draft-time row
// from all four league DBs). So every rating has the engine's own shape --
// its floor, its cap (players grow past it with coaching), its lopsidedness.
// QBs with no career sit as one block centered on the NO_CAREER_PCT
// percentile (no career = unappetizing in the draft), ordered inside the
// block by real draft position: real scouts rated a 2nd-rounder who never
// played above a 12th-rounder who never played.
played.sort((x, y) => x.score - y.score);
const N = qbs.length;
let at = Math.max(0, Math.round(NO_CAREER_PCT * N - noCareer.length / 2));
// never insert the block inside a run of tied scores (e.g. all 6'3" QBs):
// move it to the nearest boundary
{
	const split = (i) =>
		i > 0 && i < played.length && played[i - 1].score === played[i].score;
	let d = 0;
	while (split(at - d) && split(at + d)) d++;
	at = split(at - d) ? at + d : at - d;
}
// lower = better pick; undrafted last
const draftKey = (q) =>
	q.p.draft.round > 0 ? q.p.draft.round * 1000 + q.p.draft.pick : 1e9;
const block = [...noCareer].sort((x, y) => draftKey(y) - draftKey(x)); // worst first, like played
for (const q of block) q.inBlock = true;
// Band (user, 2026-10-14, +/-0.5 for every rating): instead of one solid
// block -- where a played QB at its edge jumped all ~270 no-career QBs on a
// tiny score change -- no-career QBs get
// stand-in scores spread evenly over center +/- x SD of the played scores,
// by draft position (worst pick lowest), and everyone is ranked together, so
// a played QB passes only the no-career QBs his score actually crosses. The
// center is searched so the median no-career QB still sits at NO_CAREER_PCT.
const BAND = arg("band", 0.5); // --band none = the old solid block
let sorted;
if (BAND !== "none") {
	const x = Number(BAND);
	const sdP = Math.sqrt(
		played.reduce((a, q) => a + q.score ** 2, 0) / played.length -
			(played.reduce((a, q) => a + q.score, 0) / played.length) ** 2,
	);
	// tied draft keys (undrafted) share one stand-in
	const keys = [...new Set(block.map(draftKey))];
	const posOf = new Map();
	{
		let i = 0;
		for (const k of keys) {
			const n = block.filter((q) => draftKey(q) === k).length;
			posOf.set(k, (i + (n - 1) / 2 + 0.5) / block.length);
			i += n;
		}
	}
	const place = (c) => {
		for (const q of block) {
			q.inBlock = false;
			q.score = c + (2 * posOf.get(draftKey(q)) - 1) * x * sdP;
		}
		return [...played, ...block].sort((u, v) => u.score - v.score);
	};
	let lo = played[0].score;
	let hi = played.at(-1).score;
	for (let it = 0; it < 50; it++) {
		const c = (lo + hi) / 2;
		const all = place(c);
		const ranks = block.map((q) => all.indexOf(q)).sort((u, v) => u - v);
		if (ranks[Math.floor(ranks.length / 2)] / N < NO_CAREER_PCT) lo = c;
		else hi = c;
	}
	sorted = place((lo + hi) / 2);
} else sorted = [...played.slice(0, at), ...block, ...played.slice(at)];
const keyOf = (x) => (x.inBlock ? `b${draftKey(x)}` : x.score);
for (let i = 0; i < N; ) {
	let j = i;
	while (j + 1 < N && keyOf(sorted[j + 1]) === keyOf(sorted[i])) j++;
	const avgRank = (i + j) / 2 + 1; // 1-based, ties share the mean rank
	const val = Math.round(curveAt((avgRank - 0.5) / N));
	for (let k = i; k <= j; k++) sorted[k].rating = val;
	i = j + 1;
}

// Hand pins (user-approved, applied after the curve): players a stat
// misreads, e.g. scheme effects on thp. Keyed "file|First Last".
const PINS = {
	thp: {
		// 2026-10-13: elite arms in short-passing offenses
		"2016draft.json|Patrick Mahomes": 85,
		"2019draft.json|Justin Herbert": 85,
		// Walsh's short game sank his yards/cmp; arm doubts were real at his draft
		"1978draft.json|Joe Montana": 50,
		// Shanahan play-action makes his deep completions; average arm
		"2021draft.json|Brock Purdy": 75,
	},
	spd: {
		// 2026-10-13: fastest QB ever (4.33); Lamar didn't run a 40
		"2000draft.json|Michael Vick": 95,
		"2017draft.json|Lamar Jackson": 90,
		// efficient opportunistic runs (5.3 YPC on ~250 carries), not fast
		"1955draft.json|Bart Starr": 55,
	},
	elu: {
		// 2026-10-13: first-down rate is QB sneaks (strength) + low sack rate
		"1999draft.json|Tom Brady": 30,
		// scramblers' sacks (extending plays) cost them in the 30% sack share
		"2000draft.json|Michael Vick": 70,
		"2017draft.json|Lamar Jackson": 70,
	},
	stre: {
		// 2026-10-13: breaks tackles; his rush TDs come on long runs, not sneaks
		"2017draft.json|Lamar Jackson": 30,
		// famous for shrugging off sackers (sack resistance is not in the stat)
		"2003draft.json|Ben Roethlisberger": 36,
	},
};
const pins = PINS[RATING] || {};
for (const q of qbs) {
	const pin = pins[`${q.f}|${q.name}`];
	if (pin !== undefined) {
		q.pinnedFrom = q.rating;
		q.rating = pin;
	}
}
const missingPins = Object.keys(pins).filter(
	(k) => !qbs.some((q) => `${q.f}|${q.name}` === k),
);
if (missingPins.length)
	throw new Error(`pins not found: ${missingPins.join(", ")}`);

// --- output ---
const dp = PARTS[0].scale === 100 ? 1 : 2; // static parts have no scale: 2 dp
const today = (z) => (latest ? (latest.avg + z * latest.sd).toFixed(dp) : ""); // first season part's z on today's scale
const rows = [...qbs].sort((x, y) => y.rating - x.rating || y.z - x.z);
const ft = (q) =>
	q.size ? `${Math.floor(q.size.hgt / 12)}-${q.size.hgt % 12}` : "";
fs.writeFileSync(
	path.join(dataDir, `qb_${RATING}.csv`),
	`${RATING},name,file,match,id,first,last,att,${STAT.label},z_raw,score,today,height,weight,size_z,parts\n` +
		rows
			.map((q) =>
				[
					q.rating,
					`"${q.name}"`,
					q.f,
					q.how,
					q.id,
					q.c?.first ?? "",
					q.c?.last ?? "",
					q.att,
					q.stat?.toFixed(dp) ?? "",
					q.zRaw.toFixed(3),
					q.z.toFixed(3),
					today(q.zRaw),
					ft(q),
					q.size?.weight ?? "",
					q.size ? q.sizeZ.toFixed(2) : "",
					// each part: career stat / shrunk z (sign applied)
					q.parts
						.map(
							(x, i) =>
								`${PARTS[i].static ?? `${PARTS[i].num}/${PARTS[i].den}`} ${x.stat?.toFixed(2) ?? "-"} ${x.z.toFixed(2)}`,
						)
						.join(" | "),
				].join(","),
			)
			.join("\n") +
		"\n",
);
// PFR id per QB (srID, or the career matched by name) for other scripts
fs.writeFileSync(
	path.join(dataDir, "qb_ids.json"),
	JSON.stringify(
		qbs.map((q) => ({ file: q.f, pid: q.p.pid, name: q.name, id: q.id })),
	),
);
const counts = { id: 0, name: 0, ambiguous: 0, "": 0 };
for (const q of qbs) counts[q.how]++;
console.log(
	`${RATING}: QBs ${N} | matched by id ${counts.id}, by name ${counts.name}, ambiguous ${counts.ambiguous}, none ${counts[""]} | rated from stats ${played.length} | real size ${sized.length}`,
);
console.log(
	`curve mean ${MEAN} sd ${SD} floor ${FLOOR}, parts ${PARTS.map((pt) => (pt.static ? `${pt.static} w${pt.w}` : `${pt.num}/${pt.den} w${pt.w} k${pt.k}`)).join(", ")}, size weight ${SIZE_W}; latest NFL season avg ${latest?.avg.toFixed(2)} sd ${latest?.sd.toFixed(2)}`,
);
const m = rows.reduce((a, q) => a + q.rating, 0) / N;
console.log(
	`result mean ${m.toFixed(1)} sd ${Math.sqrt(rows.reduce((a, q) => a + (q.rating - m) ** 2, 0) / N).toFixed(1)}`,
);

if (WRITE || WRITE_SIZE) {
	for (const q of qbs) {
		if (WRITE) for (const r of q.p.ratings) r[RATING] = q.rating;
		if (WRITE_SIZE && q.size) {
			q.p.hgt = q.size.hgt;
			q.p.weight = q.size.weight;
		}
	}
	for (const [f, d] of Object.entries(classes))
		fs.writeFileSync(path.join(classDir, f), JSON.stringify(d));
	console.log(
		`wrote ${[WRITE && RATING, WRITE_SIZE && "height/weight"].filter(Boolean).join(" + ")} into`,
		Object.keys(classes).length,
		"files",
	);
}
