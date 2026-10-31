// Seed the WR ratings no stat covers (2026-10-31, same rule as
// seedQb.cjs): each real WR copies all 13 (thv thp tha rbk pbk pcv tck prs rns
// kpw kac ppw pac) from one engine-generated WR, picked by a seeded hash of
// file + name. rbk/pbk are seeded too -- no blocking stats exist.
//   node seedWr.cjs [--write]
// Reads data/wrdraftratings.csv; writes data/wr_seeded.csv.
const fs = require("fs");
const path = require("path");

const SEEDED = [
	"thv",
	"thp",
	"tha",
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
const WRITE = process.argv.includes("--write");

const dataDir = path.join(__dirname, "..", "data");
const classDir =
	process.env.REAL_DRAFT_CLASSES ??
	path.join(__dirname, "..", "..", "..", "draft_classes");

const lines = fs
	.readFileSync(path.join(dataDir, "wrdraftratings.csv"), "utf8")
	.trim()
	.split(/\r?\n/);
const head = lines[0].split(",");
const engine = lines.slice(1).map((l) => {
	const v = l.split(",");
	return Object.fromEntries(SEEDED.map((k) => [k, Number(v[head.indexOf(k)])]));
});

// FNV-1a string hash -> index into the engine QBs
const pick = (key) => {
	let h = 2166136261;
	for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return (h >>> 0) % engine.length;
};

const out = [];
const files = fs
	.readdirSync(classDir)
	.filter((f) => /^\d{4}draft\.json$/.test(f))
	.sort();
for (const f of files) {
	const file = path.join(classDir, f);
	const d = JSON.parse(fs.readFileSync(file, "utf8"));
	let changed = false;
	for (const p of d.players) {
		if (p.ratings.at(-1).pos !== "WR") continue;
		const name = `${p.firstName} ${p.lastName}`;
		const src = pick(`${f}|${name}|seeded`);
		out.push(
			[`"${name}"`, f, src, ...SEEDED.map((k) => engine[src][k])].join(","),
		);
		if (WRITE) {
			for (const r of p.ratings) for (const k of SEEDED) r[k] = engine[src][k];
			changed = true;
		}
	}
	if (changed) fs.writeFileSync(file, JSON.stringify(d));
}
fs.writeFileSync(
	path.join(dataDir, "wr_seeded.csv"),
	`name,file,engine_row,${SEEDED.join(",")}\n${out.join("\n")}\n`,
);
console.log(
	`WRs ${out.length}, engine WRs ${engine.length}${WRITE ? ", written" : ""}`,
);
