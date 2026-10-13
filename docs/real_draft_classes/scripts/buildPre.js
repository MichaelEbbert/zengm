// Builds placeholder draft classes for the real 1955-1966 drafts, named by engine year (real - 1).
// Output has no ovrs/pots yet; fillOvr.football.test.ts fills those with the engine's own functions.
const fs = require("fs");
const [scratch, outDir] = process.argv.slice(2);
const picksAll = require(`${scratch}/wiki/picks.json`);
const undAll = require(`${scratch}/wiki/undrafted.json`);
const league = require(`${scratch}/bl/league1966.json`).players;

const KEYS = [
	"hgt",
	"stre",
	"spd",
	"endu",
	"thv",
	"thp",
	"tha",
	"bsc",
	"elu",
	"rtr",
	"hnd",
	"rbk",
	"pbk",
	"pcv",
	"tck",
	"prs",
	"rns",
	"kpw",
	"kac",
	"ppw",
	"pac",
];
// Same rating sets the fan files fill per position
const REL = {
	QB: "stre,spd,endu,thv,thp,tha,bsc,elu",
	RB: "stre,spd,endu,bsc,elu,hnd,rbk",
	WR: "stre,spd,endu,bsc,elu,rtr,hnd",
	TE: "stre,spd,endu,bsc,elu,rtr,hnd,rbk,pbk",
	OL: "stre,spd,endu,rbk,pbk",
	DL: "stre,spd,endu,tck,prs,rns",
	LB: "stre,spd,endu,pcv,tck,prs,rns",
	CB: "stre,spd,endu,pcv,tck",
	S: "stre,spd,endu,pcv,tck,rns",
	K: "stre,spd,endu,kpw,kac",
	P: "stre,spd,endu,ppw,pac",
};
// Median height/weight by position from the 1966-2024 fan files is too modern for the 1950s; use era-typical sizes
const SIZE = {
	QB: [73, 195],
	RB: [71, 200],
	WR: [72, 185],
	TE: [75, 225],
	OL: [74, 240],
	DL: [75, 245],
	LB: [73, 225],
	CB: [71, 185],
	S: [72, 190],
	K: [71, 190],
	P: [72, 195],
};

// Specific Wikipedia labels map directly; generic two-way-era labels split by a stable hash of the name
const DIRECT = {
	quarterback: "QB",
	halfback: "RB",
	fullback: "RB",
	"running back": "RB",
	"wide receiver": "WR",
	"tight end": "TE",
	"offensive tackle": "OL",
	"offensive guard": "OL",
	linebacker: "LB",
	"defensive tackle": "DL",
	"defensive end": "DL",
	cornerback: "CB",
	safety: "S",
	"defensive back": "CB",
	kicker: "K",
	"guard/placekicker": "K",
	punter: "P",
	"center/middle guard": "OL",
	qb: "QB",
	hb: "RB",
	fb: "RB",
	rb: "RB",
	wr: "WR",
	te: "TE",
	ot: "OL",
	og: "OL",
	lb: "LB",
	dt: "DL",
	de: "DL",
	cb: "CB",
	s: "S",
	db: "CB",
	k: "K",
	p: "P",
};
const SPLIT = {
	back: [
		["RB", 40],
		["CB", 35],
		["S", 25],
	],
	end: [
		["WR", 45],
		["TE", 20],
		["DL", 35],
	],
	tackle: [
		["OL", 55],
		["DL", 45],
	],
	guard: [
		["OL", 70],
		["LB", 15],
		["DL", 15],
	],
	center: [
		["OL", 70],
		["LB", 30],
	],
};
const hash = (s) => {
	let h = 2166136261;
	for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
	return h % 100;
};
const mapPos = (label, name) => {
	const l = (label || "").toLowerCase().replace(/\s+/g, " ").trim();
	if (DIRECT[l]) return DIRECT[l];
	if (l.startsWith("cornerback")) return "CB";
	const split =
		SPLIT[
			{ b: "back", e: "end", t: "tackle", g: "guard", c: "center" }[l] || l
		];
	if (!split) throw new Error(`unmapped position "${label}" (${name})`);
	let h = hash(name);
	for (const [pos, pct] of split) {
		if (h < pct) return pos;
		h -= pct;
	}
};

// league1966 match: same name, and real draft year equal (or the 1961 bucket that file uses for unknowns, if the name is unique)
const byName = new Map();
for (const p of league) {
	const k = `${p.firstName} ${p.lastName}`.toLowerCase();
	if (!byName.has(k)) byName.set(k, []);
	byName.get(k).push(p);
}
const allNames = {};
for (const y in picksAll)
	for (const p of [...picksAll[y], ...undAll[y]])
		allNames[p.name.toLowerCase()] = (allNames[p.name.toLowerCase()] || 0) + 1;
const findLeague = (name, realYear) => {
	// Age at the real draft must be plausible, or it's a different player with the same name
	const c = (byName.get(name.toLowerCase()) || []).filter(
		(p) => realYear - p.born.year >= 19 && realYear - p.born.year <= 27,
	);
	const exact = c.filter((p) => p.draft.year === realYear);
	if (exact.length === 1) return exact[0];
	const near = c.filter((p) => Math.abs(p.draft.year - realYear) <= 1); // league1966 draft years are sometimes a year off
	if (near.length === 1) return near[0];
	if (
		c.length === 1 &&
		allNames[name.toLowerCase()] === 1 &&
		Math.abs(c[0].draft.year - realYear) <= 6
	)
		return c[0];
	return undefined;
};

const lastSeen = {};
for (let real = 1955; real <= 1966; real++)
	for (const p of [...picksAll[real], ...undAll[real]])
		lastSeen[p.name + "|" + p.college] = real;
const keptOnce = new Set();
const keep = (p, real) => {
	const k = p.name + "|" + p.college;
	if (lastSeen[k] !== real || keptOnce.has(k)) return false;
	keptOnce.add(k);
	return true;
};
let dropped = 0;
const stats = {};
for (let real = 1955; real <= 1966; real++) {
	const Y = real - 1;
	const picks = picksAll[real]
		.filter((p) => keep(p, real) || (dropped++, false))
		.map((p, i) => ({ ...p, pick: i + 1 })); // renumber in order (fixes 1956 typos)
	const total = picks.length;
	const s = (stats[Y] = {
		real,
		picks: total,
		undrafted: undAll[real].length,
		matched: 0,
		split: 0,
		pos: {},
	});
	const players = [];
	let pickInRound = 0,
		lastRound = 0;
	for (const src of [
		...picks,
		...undAll[real].filter((p) => keep(p, real) || (dropped++, false)),
	]) {
		const drafted = src.round > 0;
		if (drafted) {
			pickInRound = src.round === lastRound ? pickInRound + 1 : 1;
			lastRound = src.round;
		}
		if (!src.pos && src.name === "Jerry Gustafson") src.pos = "Quarterback";
		const nickName = src.nick
			? src.nick + " " + src.name.split(" ").slice(-1)[0]
			: undefined;
		const lp =
			(nickName && findLeague(nickName, real)) || findLeague(src.name, real);
		let pos = lp ? lp.ratings.at(-1).pos : mapPos(src.pos, src.name);
		if (lp) s.matched++;
		else if (SPLIT[(src.pos || "").toLowerCase().trim()]) s.split++;
		if (pos === "KR" || pos === "PR") pos = "RB";
		s.pos[pos] = (s.pos[pos] || 0) + 1;
		// Placeholder grade until the stat-based rebuild: 64 at the first pick down to 48 at the last,
		// +8 for a Hall of Famer, +4 for a Pro Bowler, so the AI drafts them about where they really went
		let grade = drafted
			? 64 - (16 * (src.pick - 1)) / Math.max(1, total - 1)
			: 50;
		if (src.flag === "HOF") grade += 8;
		else if (src.flag === "PB") grade += 4;
		grade = Math.round(grade);
		const [hIn, wt] = SIZE[pos];
		const hgtIn = lp ? lp.hgt : hIn;
		const r = {};
		for (const k of KEYS) r[k] = 0;
		for (const k of REL[pos].split(",")) r[k] = grade;
		r.hgt = Math.max(0, Math.min(100, Math.round((100 * (hgtIn - 64)) / 18)));
		Object.assign(r, { pos, fuzz: 0, season: Y, skills: [] });
		const [firstName, ...rest] = lp
			? [lp.firstName, lp.lastName]
			: src.name.split(" ");
		players.push({
			born: { year: lp ? lp.born.year : Y - 22, loc: "" },
			college: src.college || "",
			draft: {
				round: drafted ? src.round : 0,
				pick: drafted ? pickInRound : 0,
				tid: -1,
				originalTid: -1,
				year: Y,
				ovr: 0,
				pot: 0,
				skills: [],
			},
			firstName,
			lastName: rest.join(" "),
			hgt: hgtIn,
			imgURL: "",
			injury: { type: "Healthy", gamesRemaining: 0 },
			injuries: [],
			pid: players.length,
			ratings: [r],
			relatives: [],
			stats: [],
			tid: -2,
			weight: lp ? lp.weight : wt,
			real: true,
			generic:
				!lp &&
				!!SPLIT[
					{ b: "back", e: "end", t: "tackle", g: "guard", c: "center" }[
						(src.pos || "").toLowerCase().trim()
					] || (src.pos || "").toLowerCase().trim()
				],
		});
	}
	// No K/P minimum: real kickers/punters only (user decision 2026-10-13)
	for (const p of players) delete p.generic;
	fs.writeFileSync(
		`${outDir}/${Y}draft.json`,
		JSON.stringify({ version: 69, startingSeason: Y, players }),
	);
}
console.error({ dropped });
console.log(JSON.stringify(stats, null, 1));
