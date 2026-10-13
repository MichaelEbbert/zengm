const fs = require("fs");
const [dir, year, pos = "QB", n = "5"] = process.argv.slice(2);
const K = [
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
const d = JSON.parse(fs.readFileSync(`${dir}/${year}draft.json`, "utf8"));
const ps = d.players
	.filter((p) => p.ratings.at(-1).pos === pos)
	.sort((a, b) => a.draft.pick - b.draft.pick)
	.slice(0, +n);
const cols = K.filter((k) => ps.some((p) => p.ratings.at(-1)[k] !== 0));
const zero = K.filter((k) => !cols.includes(k));
console.log("| Pick | Player | ovr | " + cols.join(" | ") + " |");
for (const p of ps) {
	const r = p.ratings.at(-1);
	console.log(
		`| ${p.draft.round}.${p.draft.pick} | ${p.firstName} ${p.lastName} | ${r.ovr} | ` +
			cols.map((k) => r[k]).join(" | ") +
			" |",
	);
}
console.log("all zero:", zero.join(" "));
