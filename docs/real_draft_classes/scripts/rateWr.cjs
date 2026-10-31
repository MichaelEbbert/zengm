// Rate real-draft-class WRs from real stats, one rating at a time through the
// interactive loop (real_draft_classes.md). Stats are agreed per rating.
//   node rateWr.cjs --rating hnd|rtr|hgt|bsc|spd|elu|stre|endu [--write]
//   node rateWr.cjs --write-size     (real bio hgt/weight into the files)
// Same method as rateRb.cjs: the stat only decides the ORDER; the WR at
// percentile p gets the engine-generated WR's value at percentile p
// (data/wrdraftratings.csv, 1,228 engine WRs, draft-time row, all four league
// DBs). No career (under 50 catches or targets) = a band of +/-0.5 SD around
// the 25th percentile, ordered by draft position.
// Era: each season is compared with that season's league WRs (actual /
// expected, then log), shrunk by n / (n + k), z-scored, blended.
// Class dir: REAL_DRAFT_CLASSES env, else draft_classes/ (dry runs use a copy).
const fs = require("fs");
const path = require("path");

const arg = (name, def) => {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : def;
};
const WRITE = process.argv.includes("--write");
const WRITE_SIZE = process.argv.includes("--write-size");
const dataDir = path.join(__dirname, "..", "data");
const classDir =
	process.env.REAL_DRAFT_CLASSES ??
	path.join(__dirname, "..", "..", "..", "draft_classes");

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
const norm = (n) =>
	n
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
		.replace(/[^a-z]/g, "");
const zOf = (xs) => {
	const m = xs.reduce((a, b) => a + b, 0) / xs.length;
	const sd =
		Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
	return (x) => (x - m) / sd;
};
const lg = (a, e) =>
	a > 0 && e > 0
		? Math.log(a / e)
		: a === 0 && e > 0
			? Math.log(0.5 / (e + 0.5))
			: 0;

// --- rating definitions ---
const STATS = {
	// agreed 2026-10-31: depth-adjusted catch rate + receptions per game
	hnd: {
		parts: [
			{ stat: "catch", sign: 1, w: 0.5, k: 150 },
			{ stat: "recpg", sign: 1, w: 0.5, k: 50 },
		],
	},
	// agreed 2026-10-31: targets per game + yards per target, each vs league;
	// seasons before 1977 (no targets) use receptions per game + yards per
	// catch. eraGroup: target-era and pre-target WRs are scaled separately.
	rtr: {
		eraGroup: true,
		parts: [
			{ stat: "volpg", sign: 1, w: 0.5, k: 50 },
			{ stat: "eff", sign: 1, w: 0.5, k: 150 },
		],
	},
	// agreed 2026-10-31: fumbles per touch vs league WRs, lower is better;
	// touches = catches + carries + kick/punt returns (PFR fumble totals
	// include return fumbles)
	bsc: {
		touches: true,
		parts: [{ stat: "fumpt", sign: -1, w: 1, k: 600 }],
	},
	// agreed 2026-10-31: Combine 40 time + yards per catch vs league. A 40
	// alone rates a WR with no career. Each stat mix is scaled on its own.
	spd: {
		parts: [
			{ stat: "forty", static: true, sign: -1, w: 0.6, k: 0 },
			{ stat: "ypr", sign: 1, w: 0.4, k: 100 },
		],
	},
	// punt return average 2 : yards per carry 1, each vs league (10+ returns
	// or carries to count at all). Yards per catch measures depth, not
	// elusiveness, so it's only the fallback for WRs with neither, and that
	// group gets half the spread: little evidence either way.
	elu: {
		openField: true,
		fallback: { stat: "ypr", sd: 0.5 },
		parts: [
			{ stat: "pr", sign: 1, w: 2 / 3, k: 40 },
			{ stat: "rypc", sign: 1, w: 1 / 3, k: 40 },
			{ stat: "ypr", sign: 1, w: 1, k: 100 },
		],
	},
	// agreed 2026-10-31: weight within the draft decade + receiving TDs per
	// catch vs league. A real weight alone rates a WR with no career.
	stre: {
		parts: [
			{ stat: "weight", static: true, era: true, sign: 1, w: 0.7, k: 0 },
			{ stat: "tdpc", sign: 1, w: 0.3, k: 100 },
		],
	},
	// agreed 2026-10-31: games started per game + career length (first to
	// last season; WRs active in the last data season count as at least the
	// average finished career). rates: false = doesn't make a career alone.
	endu: {
		parts: [
			{ stat: "gspg", sign: 1, w: 0.6, k: 30 },
			{ stat: "years", static: true, rates: false, sign: 1, w: 0.4, k: 0 },
		],
	},
	// agreed 2026-10-31: real height, not adjusted by decade; every WR is
	// ranked, no band, and unknown heights sit at the median
	hgt: {
		measured: true,
		parts: [{ stat: "height", sign: 1, w: 1, k: 0 }],
	},
};
const RATING = arg("rating", "hnd");
const STAT = STATS[RATING];
if (!STAT) throw new Error(`unknown --rating ${RATING}`);
const PARTS = STAT.parts;
// user-approved pins: these ratings stay exactly as set
const PINS = {
	"1963draft.json|Bob Hayes": { spd: 100 },
	"1963draft.json|Paul Warfield": { hnd: 78 },
	"1966draft.json|Tommie Smith": { spd: 95 },
	"1971draft.json|Cliff Branch": { spd: 90 },
	"1979draft.json|Lam Jones": { spd: 90 },
	"1982draft.json|Ron Brown": { spd: 90 },
	"2006draft.json|Ted Ginn Jr.": { spd: 88 },
};
const MIN_REPS = Number(arg("min-reps", 50));
const MIN_TGT = 30; // targets before catch rate counts at all
const NO_CAREER_PCT = 0.25;
const BAND = 0.5;

// --- class-file WRs ---
const files = fs
	.readdirSync(classDir)
	.filter((f) => /^\d{4}draft\.json$/.test(f))
	.sort();
const classes = {};
const wrs = [];
for (const f of files) {
	const d = JSON.parse(fs.readFileSync(path.join(classDir, f), "utf8"));
	classes[f] = d;
	const fileYear = Number(f.slice(0, 4));
	for (const p of d.players)
		if (p.ratings.at(-1).pos === "WR")
			wrs.push({ p, f, fileYear, name: `${p.firstName} ${p.lastName}` });
}

// --- receiving seasons (xTM rows replace per-team rows) ---
const seasonRows = new Map();
for (const r of readCsv("pfr_receiving.csv")) {
	const key = `${r.id}|${r.season}|${r.league}`;
	const multi = /\dTM/.test(r.team);
	const prev = seasonRows.get(key);
	const v = {
		id: r.id,
		name: r.name,
		season: Number(r.season),
		league: r.league,
		pos: r.pos,
		g: Number(r.games) || 0,
		tgt: Number(r.targets) || 0,
		rec: Number(r.rec) || 0,
		yds: Number(r.yds) || 0,
		fum: Number(r.fumbles) || 0,
		td: Number(r.td) || 0,
		gs: Number(r.gs) || 0,
		multi,
	};
	if (!prev || multi) seasonRows.set(key, v);
	else if (!prev.multi)
		for (const k of ["g", "tgt", "rec", "yds", "fum", "td", "gs"])
			prev[k] += v[k];
}
const seasons = [...seasonRows.values()];

// names -> PFR ids, for WRs with no srID
const firstSeason = new Map();
for (const s of seasons) {
	const c = firstSeason.get(s.id);
	if (!c) firstSeason.set(s.id, { name: s.name, first: s.season });
	else c.first = Math.min(c.first, s.season);
}
const byName = new Map();
for (const [id, c] of firstSeason) {
	const k = norm(c.name);
	byName.set(k, [...(byName.get(k) ?? []), { id, first: c.first }]);
}
for (const q of wrs) {
	q.id = q.p.srID || "";
	q.how = q.id ? "srID" : "";
	if (q.id) continue;
	const cands = (byName.get(norm(q.name)) ?? []).filter(
		(x) => x.first >= q.fileYear + 1 && x.first <= q.fileYear + 13,
	);
	if (cands.length === 1) {
		q.id = cands[0].id;
		q.how = "name";
	} else if (cands.length > 1) q.how = "ambiguous";
}

// PFR ids from the 1955-66 draft pages ("realDraftYear|name"), for WRs whose
// class-file name differs from PFR's (John -> Bo Farrington)
const draftIds = new Map(
	readCsv("pfr_wr_draftids.csv").map((r) => [`${r.year}|${r.name}`, r.id]),
);
for (const q of wrs) {
	const id = draftIds.get(`${q.fileYear + 1}|${q.name}`);
	if (!q.id && id) {
		q.id = id;
		q.how = "draft";
	}
}

// sizes: nflverse, then PFR player pages (pre-1970 WRs, RBs)
const size = new Map();
for (const file of ["nflverse_size.csv", "pfr_wr_size.csv", "pfr_rb_size.csv"])
	for (const r of readCsv(file))
		if (r.hgt_in && !size.has(r.id))
			size.set(r.id, { hgt: Number(r.hgt_in), weight: Number(r.weight) });
for (const q of wrs) q.sz = size.get(q.id);
if (WRITE_SIZE) {
	let n = 0;
	for (const q of wrs)
		if (q.sz) {
			q.p.hgt = q.sz.hgt;
			q.p.weight = q.sz.weight;
			n++;
		}
	for (const f of files)
		fs.writeFileSync(path.join(classDir, f), JSON.stringify(classes[f]));
	console.log(`real size written for ${n} of ${wrs.length} WRs`);
	process.exit(0);
}

// --- league baselines: WR seasons with 6+ games ---
const wrIds = new Set(wrs.map((q) => q.id).filter(Boolean));
const isWrSeason = (s) =>
	/(^|[^A-Z])(WR|SE|FL|E|LE|RE)($|[^A-Z])/.test(s.pos) || wrIds.has(s.id);
const baseKey = (s) => `${s.season}|${s.league}`;
const base = new Map();
for (const s of seasons) {
	if (s.g < 6 || !isWrSeason(s)) continue;
	const b = base.get(baseKey(s)) ?? {
		g: 0,
		rec: 0,
		yds: 0,
		tgt: 0,
		recT: 0,
		gT: 0,
		ydsT: 0,
		td: 0,
	};
	b.g += s.g;
	b.td += s.td;
	b.rec += s.rec;
	b.yds += s.yds;
	if (s.tgt >= s.rec && s.tgt > 0) {
		b.tgt += s.tgt;
		b.recT += s.rec;
		b.gT += s.g;
		b.ydsT += s.yds;
	}
	base.set(baseKey(s), b);
}
// catch rate falls as depth rises: slope of catch% on yards per catch, within
// seasons, weighted by targets (WR seasons with 30+ targets)
let sxy = 0;
let sxx = 0;
for (const s of seasons) {
	const b = base.get(baseKey(s));
	if (!b?.tgt || s.tgt < MIN_TGT || s.tgt < s.rec || !s.rec || !isWrSeason(s))
		continue;
	const x = s.yds / s.rec - b.yds / b.rec;
	const y = s.rec / s.tgt - b.recT / b.tgt;
	sxy += s.tgt * x * y;
	sxx += s.tgt * x * x;
}
const SLOPE = sxy / sxx;

// --- careers ---
const careers = new Map();
for (const s of seasons) {
	const c = careers.get(s.id) ?? {
		first: s.season,
		last: s.season,
		gs: 0,
		g: 0,
		rec: 0,
		yds: 0,
		tgt: 0,
		recT: 0,
		td: 0,
		eTd: 0,
		eYds: 0,
		eRec: 0,
		eCat: 0,
		// unit-free so seasons with and without targets add up: volume in
		// league-average games, yards in league-average targets or catches
		volA: 0,
		effA: 0,
		effE: 0,
		effN: 0,
		gT: 0,
	};
	careers.set(s.id, c);
	const b = base.get(baseKey(s));
	c.g += s.g;
	c.rec += s.rec;
	c.yds += s.yds;
	c.td += s.td;
	c.gs += s.gs;
	c.first = Math.min(c.first, s.season);
	c.last = Math.max(c.last, s.season);
	if (b) {
		c.eTd += (s.rec * b.td) / b.rec;
		c.eRec += (s.g * b.rec) / b.g;
		c.eYds += (s.rec * b.yds) / b.rec;
	}
	if (b?.tgt && s.tgt > 0 && s.tgt >= s.rec) {
		const dev = s.rec ? s.yds / s.rec - b.yds / b.rec : 0;
		const exp = Math.min(0.95, Math.max(0.2, b.recT / b.tgt + SLOPE * dev));
		c.tgt += s.tgt;
		c.recT += s.rec;
		c.eCat += s.tgt * exp;
		c.gT += s.g;
		c.volA += s.tgt / (b.tgt / b.gT);
		c.effA += s.yds / (b.ydsT / b.tgt);
		c.effE += s.tgt;
		c.effN += s.tgt;
	} else if (b) {
		c.volA += s.rec / (b.rec / b.g);
		c.effA += s.yds / (b.yds / b.rec);
		c.effE += s.rec;
		c.effN += s.rec * 1.5; // shrink k 100 catches = 150 targets
	}
}

// one total per player-season: an xTM row replaces the per-team rows
const totals = (rows, teamCol, read) => {
	const out = new Map();
	for (const r of rows) {
		const key = `${r.id}|${r.season}|${r.league}`;
		const multi = /dTM/.test(r[teamCol]);
		const v = read(r);
		const prev = out.get(key);
		if (!prev || multi) out.set(key, { ...v, multi });
		else if (!prev.multi) for (const k of Object.keys(v)) prev[k] += v[k];
	}
	return out;
};

// --- open field: punt returns vs all returners, carries vs 50+-carry rushers
if (STAT.openField) {
	const lgKey = (key) => key.slice(key.indexOf("|") + 1);
	const rush = totals(readCsv("pfr_rushing.csv"), "team_name_abbr", (r) => ({
		att: Number(r.rush_att) || 0,
		yds: Number(r.rush_yds) || 0,
	}));
	const rets = totals(readCsv("pfr_returns.csv"), "team", (r) => ({
		pr: Number(r.punt_ret) || 0,
		yds: Number(r.punt_ret_yds) || 0,
	}));
	const lgRush = new Map();
	for (const [key, x] of rush) {
		if (x.att < 50) continue;
		const b = lgRush.get(lgKey(key)) ?? { n: 0, yds: 0 };
		b.n += x.att;
		b.yds += x.yds;
		lgRush.set(lgKey(key), b);
	}
	const lgPr = new Map();
	for (const [key, x] of rets) {
		const b = lgPr.get(lgKey(key)) ?? { n: 0, yds: 0 };
		b.n += x.pr;
		b.yds += x.yds;
		lgPr.set(lgKey(key), b);
	}
	const add = (map, base, nKey, prefix) => {
		for (const [key, x] of map) {
			const c = careers.get(key.split("|")[0]);
			const b = base.get(lgKey(key));
			if (!c || !b?.n || !x[nKey]) continue;
			c[`${prefix}N`] = (c[`${prefix}N`] ?? 0) + x[nKey];
			c[`${prefix}Yds`] = (c[`${prefix}Yds`] ?? 0) + x.yds;
			c[`${prefix}E`] = (c[`${prefix}E`] ?? 0) + (x[nKey] * b.yds) / b.n;
		}
	};
	add(rush, lgRush, "att", "ru");
	add(rets, lgPr, "pr", "pr");
}

// --- touches: catches + carries + returns, per season, vs league WRs ---
if (STAT.touches) {
	const rush = totals(readCsv("pfr_rushing.csv"), "team_name_abbr", (r) => ({
		att: Number(r.rush_att) || 0,
		fum: Number(r.fumbles) || 0,
	}));
	const rets = totals(readCsv("pfr_returns.csv"), "team", (r) => ({
		ret: (Number(r.punt_ret) || 0) + (Number(r.kick_ret) || 0),
	}));
	const keys = new Set([...seasonRows.keys(), ...rush.keys(), ...rets.keys()]);
	const rows = [...keys].map((key) => {
		const [id, season, league] = key.split("|");
		const r = seasonRows.get(key);
		return {
			id,
			lg: `${season}|${league}`,
			wr: !!r && r.g >= 6 && isWrSeason(r),
			touch:
				(r?.rec ?? 0) + (rush.get(key)?.att ?? 0) + (rets.get(key)?.ret ?? 0),
			fum: Math.max(r?.fum ?? 0, rush.get(key)?.fum ?? 0),
		};
	});
	const rate = new Map();
	for (const x of rows) {
		if (!x.wr) continue;
		const b = rate.get(x.lg) ?? { touch: 0, fum: 0 };
		b.touch += x.touch;
		b.fum += x.fum;
		rate.set(x.lg, b);
	}
	for (const x of rows) {
		const c = careers.get(x.id);
		const b = rate.get(x.lg);
		if (!c || !b?.fum) continue;
		c.touch = (c.touch ?? 0) + x.touch;
		c.fum = (c.fum ?? 0) + x.fum;
		c.eFum = (c.eFum ?? 0) + (x.touch * b.fum) / b.touch;
	}
}

// --- Combine 40 times (year = real draft year): WR file, then the RB file
// for WRs who worked out as backs ---
const forty = new Map();
for (const file of [
	"nflcombine_wr_1987_2025.csv",
	"nflcombine_rb_1987_2025.csv",
])
	for (const r of readCsv(file)) {
		const key = `${r.year}|${norm(r.player)}`;
		if (Number(r.forty_yd) > 0 && !forty.has(key))
			forty.set(key, Number(r.forty_yd));
	}

// --- score ---
const lastSeason = Math.max(...seasons.map((s) => s.season));
const finished = [...careers.values()].filter(
	(c) => c.rec >= MIN_REPS && c.last < lastSeason,
);
const avgYears =
	finished.reduce((a, c) => a + (c.last - c.first + 1), 0) / finished.length;
for (const q of wrs) {
	const c = careers.get(q.id);
	q.c = c;
	q.tgt = c?.tgt ?? 0;
	q.rec = c?.rec ?? 0;
	q.career =
		STAT.measured ||
		q.rec >= MIN_REPS ||
		q.tgt >= MIN_REPS ||
		(!!STAT.openField && ((c?.prN ?? 0) >= 20 || (c?.ruN ?? 0) >= 20));
	q.v = {
		catch: q.tgt >= MIN_TGT ? { v: lg(c.recT, c.eCat), n: q.tgt } : null,
		recpg: c?.g ? { v: lg(c.rec, c.eRec), n: c.g } : null,
		volpg: c?.g ? { v: lg(c.volA, c.g), n: c.g } : null,
		eff: c?.effE ? { v: lg(c.effA, c.effE), n: c.effN } : null,
		height: q.sz ? { v: q.sz.hgt, n: 1 } : null,
		fumpt: c?.touch ? { v: lg(c.fum, c.eFum), n: c.touch } : null,
		ypr: q.rec ? { v: lg(c.yds, c.eYds), n: q.rec } : null,
		tdpc: q.rec ? { v: lg(c.td, c.eTd), n: q.rec } : null,
		gspg: c?.g ? { v: c.gs / c.g - 0.5, n: c.g } : null,
		years: c
			? {
					v:
						c.last === lastSeason
							? Math.max(c.last - c.first + 1, avgYears)
							: c.last - c.first + 1,
					n: 1,
				}
			: null,
		weight: q.sz?.weight ? { v: q.sz.weight, n: 1 } : null,
		pr: c?.prN >= 10 ? { v: lg(Math.max(c.prYds, 0), c.prE), n: c.prN } : null,
		rypc:
			c?.ruN >= 10 ? { v: lg(Math.max(c.ruYds, 0), c.ruE), n: c.ruN } : null,
		forty: forty.has(`${q.fileYear + 1}|${norm(q.name)}`)
			? { v: forty.get(`${q.fileYear + 1}|${norm(q.name)}`), n: 1 }
			: null,
	};
	q.parts = PARTS.map((pt) => {
		const x = q.v[pt.stat];
		return x ? pt.sign * x.v * (x.n / (x.n + pt.k)) : null;
	});
	if (STAT.fallback && (q.v.pr || q.v.rypc))
		q.parts[PARTS.findIndex((pt) => pt.stat === STAT.fallback.stat)] = null;
	// a measurement rates a WR with no career; his few catches then don't count
	q.measured = PARTS.some(
		(pt, i) => pt.static && pt.rates !== false && q.parts[i] !== null,
	);
	if (!q.career)
		PARTS.forEach((pt, i) => {
			if (!pt.static) q.parts[i] = null;
		});
}
// era statics: z within the draft decade
PARTS.forEach((pt, i) => {
	if (!pt.era) return;
	const dec = (q) => Math.floor(q.fileYear / 10);
	for (const d of new Set(wrs.map(dec))) {
		const g = wrs.filter((q) => dec(q) === d && q.parts[i] !== null);
		if (g.length < 2) continue;
		const z = zOf(g.map((q) => q.parts[i]));
		for (const q of g) q.parts[i] = z(q.parts[i]);
	}
});
const played = wrs.filter((q) => q.career || q.measured);
const noCareer = wrs.filter((q) => !(q.career || q.measured));
const zPart = PARTS.map((pt, i) => {
	const have = played.filter((q) => q.parts[i] !== null);
	return have.length ? zOf(have.map((q) => q.parts[i])) : () => 0;
});
for (const q of played) {
	let sum = 0;
	let wSum = 0;
	PARTS.forEach((pt, i) => {
		if (q.parts[i] === null) return;
		sum += pt.w * zPart[i](q.parts[i]);
		wSum += pt.w;
	});
	q.score = wSum ? sum / wSum : 0;
	q.pattern = STAT.eraGroup
		? q.c.gT * 2 >= q.c.g
			? "targets"
			: "pre"
		: q.parts.map((x) => (x === null ? 0 : 1)).join("");
}
// a blend of two z-scores is narrower than one alone: give every "which stats
// exist" group SD 1 around its own mean, so one-stat WRs don't own both ends
for (const pat of new Set(played.map((q) => q.pattern))) {
	const g = played.filter((q) => q.pattern === pat);
	if (g.length < 30) continue;
	const m = g.reduce((a, q) => a + q.score, 0) / g.length;
	const sd =
		Math.sqrt(g.reduce((a, q) => a + (q.score - m) ** 2, 0) / g.length) || 1;
	const fallback =
		STAT.fallback &&
		pat.at(PARTS.findIndex((pt) => pt.stat === STAT.fallback.stat)) === "1"
			? STAT.fallback.sd
			: 1;
	for (const q of g) q.score = m + ((q.score - m) / sd) * fallback;
}

if (STAT.measured) {
	const known = played
		.filter((q) => q.parts[0] !== null)
		.map((q) => q.score)
		.sort((a, b) => a - b);
	const med = known[Math.floor(known.length / 2)];
	for (const q of played) if (q.parts[0] === null) q.score = med;
}

// --- rank -> engine curve, no-career band ---
const ENGINE = readCsv("wrdraftratings.csv")
	.map((r) => Number(r[RATING]))
	.filter((v) => !Number.isNaN(v))
	.sort((a, b) => a - b);
const curveAt = (p) => {
	const x = p * (ENGINE.length - 1);
	const lo = Math.floor(x);
	const hi = Math.min(lo + 1, ENGINE.length - 1);
	return ENGINE[lo] + (ENGINE[hi] - ENGINE[lo]) * (x - lo);
};
const N = wrs.length;
const draftKey = (q) =>
	q.p.draft.round > 0 ? q.p.draft.round * 1000 + q.p.draft.pick : 1e9;
const block = [...noCareer].sort((x, y) => draftKey(y) - draftKey(x)); // worst first
const sc = played.map((q) => q.score);
const mean = sc.reduce((a, b) => a + b, 0) / sc.length;
const sdP = Math.sqrt(sc.reduce((a, b) => a + (b - mean) ** 2, 0) / sc.length);
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
	for (const q of block)
		q.score = c + (2 * posOf.get(draftKey(q)) - 1) * BAND * sdP;
	return [...played, ...block].sort((u, v) => u.score - v.score);
};
let lo = Math.min(...sc) - 3 * sdP;
let hi = Math.max(...sc) + 3 * sdP;
for (let it = 0; it < 60; it++) {
	const c = (lo + hi) / 2;
	const all = place(c);
	const ranks = block.map((q) => all.indexOf(q)).sort((u, v) => u - v);
	if (ranks[Math.floor(ranks.length / 2)] / N < NO_CAREER_PCT) lo = c;
	else hi = c;
}
const sorted = place((lo + hi) / 2);
for (let i = 0; i < N; ) {
	let j = i;
	while (j + 1 < N && sorted[j + 1].score === sorted[i].score) j++;
	const val = Math.round(curveAt(((i + j) / 2 + 0.5) / N));
	for (let k = i; k <= j; k++) sorted[k].rating = val;
	i = j + 1;
}

for (const q of wrs) {
	const pin = PINS[`${q.f}|${q.name}`]?.[RATING];
	if (pin !== undefined) q.rating = pin;
}

// --- output ---
const f3 = (x) => (x ? x.v.toFixed(3) : "");
const out = [...wrs].sort((a, b) => b.rating - a.rating || b.score - a.score);
fs.writeFileSync(
	path.join(dataDir, `wr_${RATING}.csv`),
	`${RATING},name,file,round,pick,id,how,g,rec,tgt,career,score,catch_pct,${PARTS.map((pt) => pt.stat).join(",")}\n` +
		out
			.map((q) =>
				[
					q.rating,
					`"${q.name}"`,
					q.f,
					q.p.draft.round,
					q.p.draft.pick,
					q.id,
					q.how,
					q.c?.g ?? 0,
					q.rec,
					q.tgt,
					q.career ? 1 : 0,
					q.score.toFixed(3),
					q.tgt ? (q.c.recT / q.tgt).toFixed(3) : "",
					...PARTS.map((pt) => f3(q.v[pt.stat])),
				].join(","),
			)
			.join("\n") +
		"\n",
);
const vals = wrs.map((q) => q.rating);
const m = vals.reduce((a, b) => a + b, 0) / N;
console.log(
	`${RATING}: ${N} WRs, ${played.length} rated (${wrs.filter((q) => q.career).length} career), ${noCareer.length} band; ` +
		`ids ${wrs.filter((q) => q.id).length} (name ${wrs.filter((q) => q.how === "name").length}, ambiguous ${wrs.filter((q) => q.how === "ambiguous").length}); ` +
		`slope ${SLOPE.toFixed(4)} catch/ypc; mean ${m.toFixed(1)} sd ${Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / N).toFixed(1)} ` +
		`min ${Math.min(...vals)} max ${Math.max(...vals)}`,
);
if (WRITE) {
	for (const q of wrs) for (const r of q.p.ratings) r[RATING] = q.rating;
	for (const f of files)
		fs.writeFileSync(path.join(classDir, f), JSON.stringify(classes[f]));
	console.log(`wrote ${RATING} into ${files.length} files`);
}
