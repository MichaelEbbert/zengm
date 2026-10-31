// Move real pre-1967 receivers who were filed under other positions to WR
// (user, 2026-10-31). Each was checked by hand against his PFR seasons, draft
// slot and college. Same names NOT moved: false name matches (Bob Long, Ray
// Perkins, Dave Williams, Jim Jones 1957, Bill Miller, Charley Taylor 1960).
// Safe to rerun; ratings are set by rateWr.cjs afterwards.
//   node moveToWr.cjs
const fs = require("fs");
const path = require("path");

const MOVES = {
	1954: ["Dave Middleton"],
	1955: ["Leon Clarke", "Jerry Reichow", "R. C. Owens"],
	1956: ["Terry Barr"],
	1957: ["Sonny Randle"],
	1958: ["Art Powell", "Lionel Taylor"],
	1959: ["Don Norton", "Gail Cogdill", "Carroll Dale", "Chris Burford"],
	1960: ["Charley Ferguson"],
	1961: ["Gary Ballman"],
	1962: ["Paul Flatley", "Art Graham", "Homer Jones"],
	1963: [
		"Dave Parks",
		"Charley Taylor",
		"Paul Warfield",
		"Al Denson",
		"Bob Hayes",
		"Warren Wells",
	],
	1964: ["Jack Snow", "Gary Garrison", "J.R. Wilburn"],
};

const classDir =
	process.env.REAL_DRAFT_CLASSES ??
	path.join(__dirname, "..", "..", "..", "draft_classes");
let moved = 0;
for (const [year, names] of Object.entries(MOVES)) {
	const file = path.join(classDir, `${year}draft.json`);
	const d = JSON.parse(fs.readFileSync(file, "utf8"));
	for (const name of names) {
		const hits = d.players.filter(
			(p) => `${p.firstName} ${p.lastName}` === name,
		);
		if (hits.length !== 1)
			throw new Error(`${year} ${name}: ${hits.length} matches`);
		for (const r of hits[0].ratings) r.pos = "WR";
		moved++;
	}
	fs.writeFileSync(file, JSON.stringify(d));
}
console.log(`moved ${moved} players to WR`);
