// Rate real-draft-class RBs from real stats (overnight run 2026-10-14; the
// stat choices are Claude's, made like the QB ones -- for the user to review).
//   node rateRb.cjs --rating spd|elu|stre|bsc|hnd|rtr|endu|hgt [--write]
//   node rateRb.cjs --write-size     (real bio hgt/weight into the files)
// Same method as rateQb.cjs (user, 2026-10-14): the stat only decides the
// ORDER; the RB at percentile p gets the engine-generated RB's value at
// percentile p (data/rbdraftratings.csv, 913 engine RBs, draft-time row, all
// four league DBs). No career (under 50 reps in that skill) = a band of
// +/-0.5 SD around the 25th percentile, ordered by draft position.
// Every stat is era-adjusted: actual / expected, where expected uses that
// season's league rate (rushers with 50+ carries) -- then log, shrunk by
// n / (n + k), z-scored, blended. k is large (~500 carries): per-carry stats
// from short careers (Ickey Woods, Hokie Gajan) otherwise outrank Payton.
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
	const p = path.join(dataDir, file);
	if (!fs.existsSync(p)) return [];
	const lines = fs.readFileSync(p, "utf8").trim().split(/\r?\n/);
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

// --- rating definitions ---
// part: { stat, w, k (shrink, in the part's n units), sign, static?, era? }
// static parts are measurements; rates: false = doesn't make a career alone.
const STATS = {
	// 40 time where it exists (Combine 1987+), else yards per carry
	spd: {
		career: "rush",
		parts: [
			{ stat: "forty", static: true, sign: -1, w: 0.6 },
			{ stat: "ypc", sign: 1, w: 0.4, k: 500 },
		],
	},
	// "makes yards": yards per carry + rushing first downs per carry (1977+)
	// + carries per game (coaches give the ball to who produces -- the QB elu
	// used rush attempts per game the same way); without it Gore, Bettis and
	// Curtis Martin fell to mid-pack on efficiency alone
	elu: {
		career: "rush",
		parts: [
			{ stat: "ypc", sign: 1, w: 0.35, k: 500 },
			{ stat: "fdpc", sign: 1, w: 0.3, k: 500 },
			{ stat: "apg", sign: 1, w: 0.35, k: 30 },
		],
	},
	// weight (within draft decade) + rushing TDs per carry (short yardage)
	stre: {
		career: "rush",
		parts: [
			{
				stat: "weight",
				static: true,
				rates: false,
				era: true,
				sign: 1,
				w: 0.6,
			},
			{ stat: "tdpc", sign: 1, w: 0.4, k: 600 },
		],
	},
	// fumbles per touch (all fumbles; recoveries are luck; touches include
	// kick/punt returns -- PFR fumble totals count return fumbles)
	bsc: {
		career: "rush",
		parts: [{ stat: "fumpt", sign: -1, w: 1, k: 600 }],
	},
	// catch rate (seasons with targets) + receptions per game
	hnd: {
		career: "rec",
		parts: [
			{ stat: "catch", sign: 1, w: 0.5, k: 150 },
			{ stat: "recpg", sign: 1, w: 0.5, k: 50 },
		],
	},
	// receptions per game + yards per reception
	rtr: {
		career: "rec",
		parts: [
			{ stat: "recpg", sign: 1, w: 0.6, k: 50 },
			{ stat: "ypr", sign: 1, w: 0.4, k: 100 },
		],
	},
	// workload (touches per game) + career length
	endu: {
		career: "rush",
		parts: [
			{ stat: "tpg", sign: 1, w: 0.6, k: 20 },
			{ stat: "years", static: true, rates: false, sign: 1, w: 0.4 },
		],
	},
	// real height; unknown height sits in the middle
	hgt: {
		career: "none",
		noCareer: 0.5,
		parts: [{ stat: "height", static: true, sign: 1, w: 1 }],
	},
};
const RATING = arg("rating", "spd");
const STAT = STATS[RATING];
if (!STAT && !WRITE_SIZE) throw new Error(`unknown --rating ${RATING}`);
const MIN_REPS = 50;
const NO_CAREER_PCT = STAT?.noCareer ?? 0.25;
const BAND = arg("band", "0.5");

// --- rushing seasons (all players; xTM rows replace per-team rows) ---
const seasonRows = new Map();
for (const r of readCsv("pfr_rushing.csv")) {
	const key = `${r.id}|${r.season}|${r.league}`;
	const multi = /\dTM/.test(r.team_name_abbr);
	const prev = seasonRows.get(key);
	const v = {
		id: r.id,
		name: r.name_display,
		season: Number(r.season),
		league: r.league,
		g: Number(r.games) || 0,
		att: Number(r.rush_att) || 0,
		yds: Number(r.rush_yds) || 0,
		td: Number(r.rush_td) || 0,
		fum: Number(r.fumbles) || 0,
		multi,
		fd: null,
	};
	if (!prev || multi) seasonRows.set(key, v);
	else if (!prev.multi)
		for (const k of ["g", "att", "yds", "td", "fum"]) prev[k] += v[k];
}
const fdRows = new Map();
for (const r of readCsv("pfr_rush_fd.csv")) {
	const key = `${r.id}|${r.season}|${r.league}`;
	const multi = /\dTM/.test(r.team);
	const prev = fdRows.get(key);
	if (!prev || multi) fdRows.set(key, { fd: Number(r.fd) || 0, multi });
	else if (!prev.multi) prev.fd += Number(r.fd) || 0;
}
for (const [key, s] of seasonRows)
	if (fdRows.has(key)) s.fd = fdRows.get(key).fd;
// league baselines: rushers with 50+ carries that season
const base = new Map();
for (const s of seasonRows.values()) {
	if (s.att < 50) continue;
	const k = `${s.season}|${s.league}`;
	const b = base.get(k) ?? {
		g: 0,
		att: 0,
		yds: 0,
		td: 0,
		fum: 0,
		fdAtt: 0,
		fd: 0,
	};
	b.g += s.g;
	b.att += s.att;
	b.yds += s.yds;
	b.td += s.td;
	b.fum += s.fum;
	if (s.fd !== null) {
		b.fdAtt += s.att;
		b.fd += s.fd;
	}
	base.set(k, b);
}
const careers = new Map();
for (const s of seasonRows.values()) {
	const b = base.get(`${s.season}|${s.league}`);
	const c = careers.get(s.id) ?? {
		id: s.id,
		name: s.name,
		first: s.season,
		last: s.season,
		g: 0,
		att: 0,
		yds: 0,
		td: 0,
		fum: 0,
		eYds: 0,
		eTd: 0,
		eFum: 0,
		eAtt: 0,
		fdAtt: 0,
		fd: 0,
		eFd: 0,
	};
	careers.set(s.id, c);
	c.first = Math.min(c.first, s.season);
	c.last = Math.max(c.last, s.season);
	c.g += s.g;
	c.att += s.att;
	c.yds += s.yds;
	c.td += s.td;
	c.fum += s.fum;
	if (b) {
		c.eYds += (s.att * b.yds) / b.att;
		c.eTd += (s.att * b.td) / b.att;
		c.eFum += (s.att * b.fum) / b.att;
		c.eAtt += (s.g * b.att) / b.g;
		if (s.fd !== null && b.fdAtt) {
			c.fdAtt += s.att;
			c.fd += s.fd;
			c.eFd += (s.att * b.fd) / b.fdAtt;
		}
	}
}
const lastSeason = Math.max(...[...seasonRows.values()].map((s) => s.season));
const rec = new Map(
	readCsv("pfr_rb_rec.csv").map((r) => [
		r.id,
		Object.fromEntries(
			Object.entries(r).map(([k, v]) => [
				k,
				k === "id" || k === "name" ? v : Number(v),
			]),
		),
	]),
);
// career kick + punt returns (PFR returns pages): PFR fumble totals include
// return fumbles, so returns count as touches for bsc
const rets = new Map(
	readCsv("pfr_rb_ret.csv").map((r) => [r.id, Number(r.ret) || 0]),
);
// names -> PFR ids (rushing + receiving), for players with no srID
const byName = new Map();
const addName = (name, id, first) => {
	const k = norm(name);
	const list = byName.get(k) ?? [];
	if (!list.some((x) => x.id === id)) list.push({ id, first });
	else
		list.find((x) => x.id === id).first = Math.min(
			list.find((x) => x.id === id).first,
			first,
		);
	byName.set(k, list);
};
for (const c of careers.values()) addName(c.name, c.id, c.first);
for (const r of rec.values()) if (r.name) addName(r.name, r.id, r.first);

// sizes: PFR player pages (pre-1970 RBs), nflverse, then Combine
const size = new Map();
for (const r of readCsv("nflverse_size.csv"))
	size.set(r.id, {
		hgt: Number(r.hgt_in),
		weight: Number(r.weight),
		src: "nflverse",
	});
for (const r of readCsv("pfr_rb_size.csv"))
	if (r.hgt_in && !size.has(r.id))
		size.set(r.id, {
			hgt: Number(r.hgt_in),
			weight: Number(r.weight),
			src: "pfr",
		});
const combine = new Map();
for (const r of readCsv("nflcombine_rb_1987_2025.csv"))
	combine.set(`${r.year}|${norm(r.player)}`, {
		forty: Number(r.forty_yd) || null,
		hgt: Number(r.height_in) || null,
		weight: Number(r.weight) || null,
	});

// PFR ids found via the draft pages ("realDraftYear|name"), for RBs with no
// srID and no stats under their class-file name (e.g. Timothy -> Timmy Brown)
const draftIds = new Map(
	readCsv("pfr_rb_draftids.csv").map((r) => [`${r.year}|${r.name}`, r.id]),
);

// --- RBs in the class files ---
const files = fs
	.readdirSync(classDir)
	.filter((f) => /^\d{4}draft\.json$/.test(f))
	.sort();
const classes = {};
const rbs = [];
for (const f of files) {
	const d = JSON.parse(fs.readFileSync(path.join(classDir, f), "utf8"));
	classes[f] = d;
	const fileYear = Number(f.slice(0, 4));
	for (const p of d.players) {
		if (p.ratings.at(-1).pos !== "RB") continue;
		const name = `${p.firstName} ${p.lastName}`;
		let id = p.srID || "";
		let how = id ? "srID" : "";
		if (!id) {
			// real draft = fileYear + 1; first NFL season then or within 12 years
			const cands = (byName.get(norm(name)) || []).filter(
				(x) => x.first >= fileYear + 1 && x.first <= fileYear + 13,
			);
			if (cands.length === 1) {
				id = cands[0].id;
				how = "name";
			} else if (cands.length > 1) how = "ambiguous";
			if (!id && draftIds.has(`${fileYear + 1}|${name}`)) {
				id = draftIds.get(`${fileYear + 1}|${name}`);
				how = "draft";
			}
		}
		const cmb = combine.get(`${fileYear + 1}|${norm(name)}`);
		let sz = size.get(id);
		if (!sz && cmb?.hgt)
			sz = { hgt: Math.round(cmb.hgt), weight: cmb.weight, src: "combine" };
		rbs.push({
			p,
			f,
			fileYear,
			name,
			id,
			how,
			c: careers.get(id),
			r: rec.get(id),
			cmb,
			sz,
		});
	}
}

if (WRITE_SIZE) {
	let n = 0;
	for (const q of rbs)
		if (q.sz) {
			q.p.hgt = q.sz.hgt;
			q.p.weight = q.sz.weight;
			n++;
		}
	for (const f of files)
		fs.writeFileSync(path.join(classDir, f), JSON.stringify(classes[f]));
	console.log(`real size written for ${n} of ${rbs.length} RBs`);
	process.exit(0);
}

// --- stats per RB ---
const lg = (a, e) =>
	a > 0 && e > 0
		? Math.log(a / e)
		: a === 0 && e > 0
			? Math.log(0.5 / (e + 0.5))
			: 0;
for (const q of rbs) {
	const c = q.c;
	const r = q.r;
	const att = c?.att ?? 0;
	const recs = r?.rec ?? 0;
	const tgt = r?.tgt ?? 0;
	q.att = att;
	q.rec = recs;
	const years = c
		? c.last === lastSeason
			? null // active: filled below with max(span, avg)
			: c.last - c.first + 1
		: null;
	q.v = {
		forty: q.cmb?.forty ?? null,
		weight: q.sz?.weight ?? null,
		height: q.sz?.hgt ?? null,
		ypc: att ? { v: lg(c.yds, c.eYds), n: att } : null,
		fdpc: c?.fdAtt >= 1 ? { v: lg(c.fd, c.eFd), n: c.fdAtt } : null,
		tdpc: att ? { v: lg(c.td, c.eTd), n: att } : null,
		// carries per game vs the season's 50+-carry rushers, n = games
		apg: c?.g && c.eAtt ? { v: lg(att, c.eAtt), n: c.g } : null,
		// expected fumbles per carry scaled to all touches (carries, catches,
		// kick/punt returns)
		fumpt: att
			? {
					v: lg(c.fum, (c.eFum * (att + recs + (rets.get(q.id) ?? 0))) / att),
					n: att + recs + (rets.get(q.id) ?? 0),
				}
			: null,
		catch: tgt >= 30 ? { v: lg(r.rec_t, r.exp_cat), n: tgt } : null,
		recpg: r?.g ? { v: lg(recs, r.exp_rec), n: r.g } : null,
		ypr: recs ? { v: lg(r.yds, r.exp_yds), n: recs } : null,
		tpg: c?.g ? { v: Math.log((att + recs + 1) / c.g), n: c.g } : null,
		years,
	};
	q.career =
		STAT.career === "rush"
			? att >= MIN_REPS
			: STAT.career === "rec"
				? recs >= MIN_REPS || tgt >= MIN_REPS
				: false;
}
{
	// active careers count at least the average finished career
	const fin = rbs.filter(
		(q) => q.c && q.att >= MIN_REPS && q.c.last < lastSeason,
	);
	const avg =
		fin.reduce((a, q) => a + (q.c.last - q.c.first + 1), 0) / fin.length;
	for (const q of rbs)
		if (q.c && q.c.last === lastSeason)
			q.v.years = Math.max(q.c.last - q.c.first + 1, avg);
}

// --- score ---
const PARTS = STAT.parts;
for (const q of rbs) {
	q.parts = PARTS.map((pt) => {
		const x = q.v[pt.stat];
		if (x === null || x === undefined) return null;
		if (pt.static) return pt.sign * x;
		return pt.sign * x.v * (x.n / (x.n + pt.k));
	});
	q.measured = PARTS.some(
		(pt, i) => pt.static && pt.rates !== false && q.parts[i] !== null,
	);
}
// era statics: z within the draft decade
PARTS.forEach((pt, i) => {
	if (!pt.era) return;
	const dec = (q) => Math.floor(q.fileYear / 10);
	for (const d of new Set(rbs.map(dec))) {
		const g = rbs.filter((q) => dec(q) === d && q.parts[i] !== null);
		if (g.length < 2) continue;
		const z = zOf(g.map((q) => q.parts[i]));
		for (const q of g) q.parts[i] = z(q.parts[i]);
	}
});
const played = rbs.filter((q) => q.career || q.measured);
const noCareer = rbs.filter((q) => !(q.career || q.measured));
const zPart = PARTS.map((pt, i) => {
	const have = played.filter(
		(q) => q.parts[i] !== null && (pt.static || q.career),
	);
	return have.length ? zOf(have.map((q) => q.parts[i])) : () => 0;
});
for (const q of played) {
	let sum = 0;
	let wSum = 0;
	PARTS.forEach((pt, i) => {
		if (q.parts[i] === null) return;
		if (!pt.static && !q.career) return; // a few carries say nothing
		sum += pt.w * zPart[i](q.parts[i]);
		wSum += pt.w;
	});
	q.score = wSum ? sum / wSum : 0;
	q.pattern = PARTS.map((pt, i) =>
		q.parts[i] !== null && (pt.static || q.career) ? 1 : 0,
	).join("");
}
// A blend of two z-scores is narrower than one alone, so RBs scored on one
// stat (e.g. pre-Combine backs on yards per carry only) would own both ends.
// Give every "which stats exist" group the same spread (SD 1, own mean).
for (const pat of new Set(played.map((q) => q.pattern))) {
	const g = played.filter((q) => q.pattern === pat);
	if (g.length < 30) continue;
	const m = g.reduce((a, q) => a + q.score, 0) / g.length;
	const sd =
		Math.sqrt(g.reduce((a, q) => a + (q.score - m) ** 2, 0) / g.length) || 1;
	for (const q of g) q.score = m + (q.score - m) / sd;
}

// --- rank -> engine curve, no-career band ---
const ENGINE = readCsv("rbdraftratings.csv")
	.map((r) => Number(r[RATING]))
	.filter((v) => !Number.isNaN(v))
	.sort((a, b) => a - b);
const curveAt = (p) => {
	const x = p * (ENGINE.length - 1);
	const lo = Math.floor(x);
	const hi = Math.min(lo + 1, ENGINE.length - 1);
	return ENGINE[lo] + (ENGINE[hi] - ENGINE[lo]) * (x - lo);
};
const N = rbs.length;
const draftKey = (q) =>
	q.p.draft.round > 0 ? q.p.draft.round * 1000 + q.p.draft.pick : 1e9;
const block = [...noCareer].sort((x, y) => draftKey(y) - draftKey(x)); // worst first
let sorted;
if (BAND !== "none" && block.length) {
	const x = Number(BAND);
	const sc = played.map((q) => q.score);
	const mean = sc.reduce((a, b) => a + b, 0) / sc.length;
	const sdP = Math.sqrt(
		sc.reduce((a, b) => a + (b - mean) ** 2, 0) / sc.length,
	);
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
			q.score = c + (2 * posOf.get(draftKey(q)) - 1) * x * sdP;
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
	sorted = place((lo + hi) / 2);
} else sorted = [...played].sort((u, v) => u.score - v.score);
for (let i = 0; i < N; ) {
	let j = i;
	while (j + 1 < N && sorted[j + 1].score === sorted[i].score) j++;
	const val = Math.round(curveAt(((i + j) / 2 + 0.5) / N));
	for (let k = i; k <= j; k++) sorted[k].rating = val;
	i = j + 1;
}

// --- output ---
const fmt = (x) =>
	x === null || x === undefined
		? ""
		: typeof x === "number"
			? x.toFixed(3)
			: (x.v / 1).toFixed(3);
const out = [...rbs].sort((a, b) => b.rating - a.rating || b.score - a.score);
fs.writeFileSync(
	path.join(dataDir, `rb_${RATING}.csv`),
	`${RATING},name,file,round,pick,id,how,att,rec,career,score,${PARTS.map((pt) => pt.stat).join(",")}\n` +
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
					q.att,
					q.rec,
					q.career || q.measured ? 1 : 0,
					q.score.toFixed(3),
					...PARTS.map((pt) => fmt(q.v[pt.stat])),
				].join(","),
			)
			.join("\n") +
		"\n",
);
const vals = rbs.map((q) => q.rating);
const m = vals.reduce((a, b) => a + b, 0) / vals.length;
console.log(
	`${RATING}: ${N} RBs, ${played.length} rated (${rbs.filter((q) => q.career).length} career), ${noCareer.length} band; ` +
		`ids ${rbs.filter((q) => q.id).length} (name ${rbs.filter((q) => q.how === "name").length}, ambiguous ${rbs.filter((q) => q.how === "ambiguous").length}); ` +
		`mean ${m.toFixed(1)} sd ${Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / N).toFixed(1)}`,
);
if (WRITE) {
	for (const q of rbs) for (const r of q.p.ratings) r[RATING] = q.rating;
	for (const f of files)
		fs.writeFileSync(path.join(classDir, f), JSON.stringify(classes[f]));
	console.log(`wrote ${RATING} into ${files.length} files`);
}
