// Seed the QB ratings no stat covers (real_draft_classes.md, "Unused ratings
// that must still be seeded"): each real QB copies all 12 from one
// engine-generated QB, picked by a seeded hash of file + name, so the values
// stay realistic together and reruns give the same numbers (user, 2026-10-13).
//   node seedQb.cjs [--write]
// Reads data/qbdraftratings.csv (engine QBs' draft-time values from the league
// DBs) and every draft_classes/*draft.json; writes data/qb_seeded.csv.
// --write puts the ratings into the class files (compact JSON; run
// `npx oxfmt draft_classes` afterwards).
const fs = require("fs");
const path = require("path");

const SEEDED = [
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
const WRITE = process.argv.includes("--write");

const dataDir = path.join(__dirname, "..", "data");
const classDir =
	process.env.REAL_DRAFT_CLASSES ??
	path.join(__dirname, "..", "..", "..", "draft_classes");

const lines = fs
	.readFileSync(path.join(dataDir, "qbdraftratings.csv"), "utf8")
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
		if (p.ratings.at(-1).pos !== "QB") continue;
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
	path.join(dataDir, "qb_seeded.csv"),
	`name,file,engine_row,${SEEDED.join(",")}\n${out.join("\n")}\n`,
);
console.log(
	`QBs ${out.length}, engine QBs ${engine.length}${WRITE ? ", written" : ""}`,
);
