// Parses Wikipedia "{year} NFL draft" wikitext (1955-1966) into picks.json + undrafted.json
const fs = require("fs");
const dir = process.argv[2];
const clean = (c) => {
	c = c
		.replace(/<ref[^>]*\/>/g, "")
		.replace(/<ref[\s\S]*?<\/ref>/g, "")
		.replace(/<[^>]+>/g, "");
	c = c.replace(/^\s*(?:[a-z-]+\s*=\s*"?[^|"[]*"?\s*)+\|(?!\|)/i, "");
	c = c.replace(/\{\{sort\|[^|}]*\|([^}]*)\}\}/gi, "$1");
	c = c
		.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
		.replace(/\{\{[^}]*\}\}/g, "")
		.replace(/'''?/g, "");
	return c
		.replace(/[†‡*^#§]/g, "")
		.replace(/^\|/, "")
		.trim();
};
const flagOf = (line) =>
	/FFCC00/i.test(line) ? "HOF" : /faecc8/i.test(line) ? "PB" : "";
const out = {},
	undrafted = {};
for (let y = 1955; y <= 1966; y++) {
	const w = JSON.parse(fs.readFileSync(`${dir}/${y}.json`, "utf8")).parse
		.wikitext;
	const overall = Number((w.match(/\|\s*overall\s*=\s*(\d+)/) || [])[1]);
	const picks = [],
		und = [];
	// Format A: wikitable per round
	const parts = w.split(/===\s*Round\s+(\d+)\s*===/);
	for (let i = 1; i < parts.length; i += 2) {
		const round = Number(parts[i]);
		const table = parts[i + 1].split("|}")[0];
		for (const row of table.split(/\n\|-[^\n]*/).slice(1)) {
			const line = row.trim();
			if (!line.startsWith("|")) continue;
			const cells = line
				.replace(/^\|/, "")
				.split(/\|\||\n\|/)
				.map(clean);
			if (cells.length < 5) throw new Error(`${y} bad row ${line}`);
			const [pick, team, name, pos, college] = cells;
			picks.push({
				round,
				pick: Number(pick),
				team,
				name,
				pos,
				college,
				flag: flagOf(line),
			});
		}
	}
	// Format B: {{NFLDraft-row ...}} templates (also used for undrafted lists)
	for (const m of w.matchAll(/\{\{NFLDraft-row([\s\S]*?)\}\}/g)) {
		const f = {};
		for (const kv of m[1].split("|").slice(1)) {
			const k = kv.split("=")[0].trim();
			f[k] = kv.split("=").slice(1).join("=").trim();
		}
		const rec = {
			round: Number(f.round) || 0,
			pick: Number(f.picknum) || 0,
			team: f.team,
			name: clean(`${f.first} ${f.last}`),
			pos: f.position,
			college: f.collegelink || f.college,
			flag: f.hof === "yes" ? "HOF" : f.probowl === "yes" ? "PB" : "",
		};
		(f.undrafted === "yes" ? und : picks).push(rec);
	}
	// Undrafted lists in wikitable form
	const usec = (w.split(/==\s*Notable undrafted players\s*==/)[1] || "").split(
		/\n==[^=]/,
	)[0];
	if (!usec.includes("NFLDraft-row")) {
		for (const row of usec.split(/\n\|-[^\n]*/).slice(1)) {
			const line = row.trim();
			if (!line.startsWith("|") || /Pro Bowl|Hall of Fame/.test(line)) continue;
			const cells = line
				.replace(/^\|/, "")
				.split(/\|\||\n\|/)
				.map(clean)
				.filter((c) => c !== "");
			und.push({ raw: cells, flag: flagOf(line) });
		}
	}
	for (const p of [...picks, ...und]) {
		if (/HOF$/.test(p.name)) {
			p.name = p.name.replace(/HOF$/, "");
			p.flag = "HOF";
		}
		p.name = p.name
			.replace(/\s+\d+$/, "")
			.replace(/,\s*Sr\.$/, "")
			.replace(/\s+/g, " ")
			.trim();
		const nick = p.name.match(/["(]([^")]+)[")]/);
		if (nick) {
			p.nick = nick[1];
			p.name = p.name.replace(/\s*["(][^")]+[")]/, "").trim();
		}
		p.pos = (p.pos || "")
			.replace(/^HOF\|/, "")
			.split(",")[0]
			.trim();
	}
	picks.sort((a, b) => a.pick - b.pick);
	out[y] = picks;
	undrafted[y] = und;
	const bad = picks.filter((p) => !p.pick || !p.name || !p.pos);
	const dup = picks.length - new Set(picks.map((p) => p.pick)).size;
	console.log(
		y,
		"overall",
		overall,
		"parsed",
		picks.length,
		"bad",
		bad.length,
		"dupPicks",
		dup,
		"HOF",
		picks.filter((p) => p.flag === "HOF").length,
		"undrafted",
		und.length,
	);
}
fs.writeFileSync(`${dir}/picks.json`, JSON.stringify(out));
fs.writeFileSync(`${dir}/undrafted.json`, JSON.stringify(undrafted, null, 1));
const pos = {};
for (const y in out) for (const p of out[y]) pos[p.pos] = (pos[p.pos] || 0) + 1;
console.log(pos);
