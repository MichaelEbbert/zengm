// Renames {N}draft.json -> {N-1}draft.json and shifts every year inside by -1,
// so file names match the engine's draft-year labels. Uploads behave identically.
const fs = require("fs"),
	path = require("path");
const [dir, out] = process.argv.slice(2);
let files = 0,
	players = 0;
for (const f of fs
	.readdirSync(dir)
	.filter((f) => /^\d{4}draft\.json$/.test(f))) {
	const y = Number(f.slice(0, 4));
	const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
	if (d.startingSeason !== y)
		throw new Error(`${f}: startingSeason ${d.startingSeason}`);
	d.startingSeason -= 1;
	for (const p of d.players) {
		p.born.year -= 1;
		p.draft.year -= 1;
		for (const r of p.ratings) r.season -= 1;
		players++;
	}
	fs.writeFileSync(path.join(out, `${y - 1}draft.json`), JSON.stringify(d));
	files++;
}
console.log({ files, players });
