const fs = require("fs"),
	path = require("path");
const dir = process.argv[2];
let n = 0,
	files = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
	const fp = path.join(dir, f);
	const d = JSON.parse(fs.readFileSync(fp, "utf8"));
	for (const p of d.players) {
		p.real = true;
		n++;
	}
	// Compact on purpose: oxfmt collapses short objects only when they start on one line
	fs.writeFileSync(fp, JSON.stringify(d));
	files++;
}
console.log({ files, players: n });
