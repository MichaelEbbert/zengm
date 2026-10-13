const fs = require("fs");
const [S] = process.argv.slice(2);
const L = JSON.parse(fs.readFileSync(S + "/udfa.json"));
const O = JSON.parse(fs.readFileSync(S + "/ovr50.json"));
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
const POS = Object.keys(O);
// position medians of physical height/weight across all files
const phys = {};
for (const f of fs.readdirSync("draft_classes")) {
	for (const p of JSON.parse(fs.readFileSync("draft_classes/" + f)).players) {
		const k = p.ratings.at(-1).pos;
		phys[k] ??= { h: [], w: [] };
		phys[k].h.push(p.hgt);
		phys[k].w.push(p.weight);
	}
}
const med = (a) => {
	a = [...a].sort((x, y) => x - y);
	return a[Math.floor(a.length / 2)];
};
const byYear = {};
for (const e of L) (byYear[e[3]] ??= []).push(e);
const touched = [];
for (const [y, list] of Object.entries(byYear)) {
	const fp = `draft_classes/${y}draft.json`;
	const d = JSON.parse(fs.readFileSync(fp));
	for (const [first, last, pos, year, born] of list) {
		if (
			d.players.some(
				(p) =>
					p.firstName === first &&
					p.lastName === last &&
					p.ratings.at(-1).pos === pos,
			)
		)
			continue;
		const age = Math.min(28, Math.max(20, year - born));
		const ovr = O[pos].ovr,
			pot = Math.max(ovr, O[pos].pot[age]);
		const ovrs = Object.fromEntries(POS.map((k) => [k, O[k].ovr]));
		const pots = Object.fromEntries(
			POS.map((k) => [k, Math.max(O[k].ovr, O[k].pot[age])]),
		);
		const r = Object.fromEntries(KEYS.map((k) => [k, 50]));
		Object.assign(r, {
			pos,
			ovr,
			pot,
			fuzz: 0,
			season: year,
			skills: [],
			ovrs,
			pots,
		});
		d.players.push({
			born: { year: born, loc: "" },
			college: "",
			draft: {
				round: 0,
				pick: 0,
				tid: -1,
				originalTid: -1,
				year,
				ovr,
				pot,
				skills: [],
			},
			firstName: first,
			hgt: med(phys[pos].h),
			imgURL: "",
			injury: { type: "Healthy", gamesRemaining: 0 },
			injuries: [],
			lastName: last,
			ratings: [r],
			relatives: [],
			stats: [],
			tid: -2,
			weight: med(phys[pos].w),
			real: true,
			undrafted: true,
		});
		console.log(
			year,
			pos,
			first,
			last,
			"age",
			year - born,
			"ovr",
			ovr,
			"pot",
			pot,
		);
	}
	fs.writeFileSync(fp, JSON.stringify(d));
	touched.push(fp);
}
fs.writeFileSync(S + "/touched.txt", touched.join("\n"));
