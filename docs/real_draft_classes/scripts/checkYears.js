const fs = require("fs"),
	path = require("path");
const [dir, origDir] = process.argv.slice(2);
const problems = [],
	ages = {},
	otherYears = {};
let files = 0,
	players = 0,
	origMatched = 0;
const walk = (o, p, cb) => {
	for (const [k, v] of Object.entries(o)) {
		const q = p + "." + k;
		if (v && typeof v === "object") walk(v, q, cb);
		else cb(q, v);
	}
};
for (const f of fs
	.readdirSync(dir)
	.filter((f) => /^\d{4}draft\.json$/.test(f))
	.sort()) {
	const y = Number(f.slice(0, 4));
	const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
	files++;
	if (d.startingSeason !== y)
		problems.push(`${f} startingSeason ${d.startingSeason}`);
	const orig = JSON.parse(
		fs.readFileSync(path.join(origDir, `${y + 1}draft.json`), "utf8"),
	);
	const origByKey = new Map(
		orig.players.map((p) => [
			p.firstName + "|" + p.lastName + "|" + p.draft.pick + "|" + p.draft.round,
			p,
		]),
	);
	for (const p of d.players) {
		players++;
		const who = `${f} ${p.firstName} ${p.lastName}`;
		if (p.draft.year !== y) problems.push(`${who} draft.year ${p.draft.year}`);
		for (const r of p.ratings)
			if (r.season !== y) problems.push(`${who} ratings.season ${r.season}`);
		const age = y - p.born.year;
		ages[age] = (ages[age] || 0) + 1;
		const o = origByKey.get(
			p.firstName + "|" + p.lastName + "|" + p.draft.pick + "|" + p.draft.round,
		);
		if (o) {
			origMatched++;
			if (o.startingSeason !== undefined);
			if (orig.startingSeason - o.born.year !== age)
				problems.push(
					`${who} age ${age} vs original ${orig.startingSeason - o.born.year}`,
				);
		}
		walk(p, "", (k, v) => {
			if (
				typeof v === "number" &&
				v >= 1900 &&
				v <= 2100 &&
				!["born.year", "draft.year", "ratings.0.season"].includes(k.slice(1))
			)
				otherYears[k] = (otherYears[k] || 0) + 1;
		});
	}
}
console.log({ files, players, origMatched, problems: problems.length });
console.log(problems.slice(0, 20));
console.log("age at draft:", ages);
console.log("other year-like fields:", otherYears);
