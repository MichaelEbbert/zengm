// SQLite operations for the Electron main process.
// Opened per-league: <dbDir>/league-<lid>.db
// Called from the HTTP API endpoints in main.js.

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const TEAM_STAT_KEYS = [
	"drives",
	"totStartYds",
	"timePos",
	"skAlw",
	"tp",
	"tpa",
	"fmb",
	"fmbLost",
	"pssCmp",
	"pss",
	"pssYds",
	"pssTD",
	"pssInt",
	"pssLng",
	"pssSk",
	"pssSkYds",
	"rus",
	"rusYds",
	"rusTD",
	"rusLng",
	"tgt",
	"rec",
	"recYds",
	"recTD",
	"recLng",
	"pr",
	"prYds",
	"prTD",
	"prLng",
	"kr",
	"krYds",
	"krTD",
	"krLng",
	"defInt",
	"defIntYds",
	"defIntTD",
	"defIntLng",
	"defPssDef",
	"defFmbFrc",
	"defFmbRec",
	"defFmbYds",
	"defFmbTD",
	"defFmbLng",
	"defSk",
	"defTckSolo",
	"defTckAst",
	"defTckLoss",
	"defSft",
	"fg0",
	"fga0",
	"fg20",
	"fga20",
	"fg30",
	"fga30",
	"fg40",
	"fga40",
	"fg50",
	"fga50",
	"fgLng",
	"xp",
	"xpa",
	"ko",
	"koYds",
	"koTB",
	"ok",
	"okRec",
	"pnt",
	"pntYds",
	"pntLng",
	"pntTB",
	"pntIn20",
	"pntBlk",
	"pen",
	"penYds",
	"pbw",
	"pba",
	"rbw",
	"rba",
];

const PLAYER_STAT_KEYS = [
	"gp",
	"gs",
	"min",
	"fmb",
	"fmbLost",
	"pssCmp",
	"pss",
	"pssYds",
	"pssTD",
	"pssInt",
	"pssLng",
	"pssSk",
	"pssSkYds",
	"rus",
	"rusYds",
	"rusTD",
	"rusLng",
	"tgt",
	"rec",
	"recYds",
	"recTD",
	"recLng",
	"pr",
	"prYds",
	"prTD",
	"prLng",
	"kr",
	"krYds",
	"krTD",
	"krLng",
	"defInt",
	"defIntYds",
	"defIntTD",
	"defIntLng",
	"defPssDef",
	"defFmbFrc",
	"defFmbRec",
	"defFmbYds",
	"defFmbTD",
	"defFmbLng",
	"defSk",
	"defTckSolo",
	"defTckAst",
	"defTckLoss",
	"defSft",
	"fg0",
	"fga0",
	"fg20",
	"fga20",
	"fg30",
	"fga30",
	"fg40",
	"fga40",
	"fg50",
	"fga50",
	"fgLng",
	"xp",
	"xpa",
	"ko",
	"koYds",
	"koTB",
	"ok",
	"okRec",
	"pnt",
	"pntYds",
	"pntLng",
	"pntTB",
	"pntIn20",
	"pntBlk",
	"pen",
	"penYds",
	"pbw",
	"pba",
	"rbw",
	"rba",
];

const TEAM_STAT_COLS = TEAM_STAT_KEYS.map(toSnake);
const PLAYER_STAT_COLS = PLAYER_STAT_KEYS.map(toSnake);

// Player-domain constants
const FOOTBALL_POSITIONS = [
	"QB",
	"RB",
	"WR",
	"TE",
	"OL",
	"DL",
	"LB",
	"CB",
	"S",
	"K",
	"P",
	"KR",
	"PR",
];
const RATING_KEYS = [
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
const CAREER_DERIVED_KEYS = ["av", "qbW", "qbL", "qbT", "qbOTL"];
const CAREER_STAT_KEYS = [...CAREER_DERIVED_KEYS, ...PLAYER_STAT_KEYS, "skAlw"];
const CAREER_STAT_COLS = CAREER_STAT_KEYS.map(toSnake);

// Column lists for prepared statements (players domain)
const PLAYER_TABLE_COLS = [
	"pid",
	"first_name",
	"last_name",
	"tid",
	"retired_year",
	"hof",
	"watch",
	"value",
	"value_no_pot",
	"value_fuzz",
	"value_no_pot_fuzz",
	"roster_order",
	"pt_modifier",
	"games_until_tradable",
	"num_days_free_agent",
	"years_free_agent",
	"born_year",
	"born_loc",
	"college",
	"weight",
	"hgt",
	"img_url",
	"jersey_number",
	"pos",
	"note",
	"note_bool",
	"real",
	"sr_id",
	"died_year",
	"draft_year",
	"draft_round",
	"draft_pick",
	"draft_tid",
	"draft_original_tid",
	"draft_pot",
	"draft_ovr",
	"draft_skills",
	"draft_dpid",
	"injury_type",
	"injury_games_remaining",
	"injury_score",
	"contract_amount",
	"contract_exp",
	"face",
	"custom_mood_items",
	"num_players_traded_away",
	"p_fatigue",
	"num_consecutive_games_g",
];
const PS_FIXED_COLS = [
	"pid",
	"season",
	"tid",
	"playoffs",
	"years_with_team",
	"jersey_number",
];
const PS_ALL_COLS = [...PS_FIXED_COLS, ...CAREER_STAT_COLS];
const PR_BASE_COLS = [
	"pid",
	"season",
	"seq",
	...RATING_KEYS.map(toSnake),
	"fuzz",
	"ovr",
	"pot",
	"pos",
	"skills",
	"injury_index",
	"locked",
];
const PR_OVR_COLS = FOOTBALL_POSITIONS.map((p) => `ovr_${p.toLowerCase()}`);
const PR_POT_COLS = FOOTBALL_POSITIONS.map((p) => `pot_${p.toLowerCase()}`);
const PR_ALL_COLS = [...PR_BASE_COLS, ...PR_OVR_COLS, ...PR_POT_COLS];
const PLAYER_CHILD_TABLES = [
	"player_stats",
	"player_ratings",
	"player_injuries",
	"player_salaries",
	"player_awards",
	"player_relatives",
	"player_mood_traits",
	"player_transactions",
];

const GAME_COLS = [
	"gid",
	"season",
	"day",
	"att",
	"overtimes",
	"num_periods",
	"playoffs",
	"finals",
	"neutral_site",
	"won_tid",
	"won_pts",
	"lost_tid",
	"lost_pts",
];
const TEAM_FIXED_COLS = [
	"gid",
	"tid",
	"pts",
	"pts_qtrs",
	"ovr",
	"won",
	"lost",
	"tied",
	"otl",
	"playoff_seed",
	"playoff_won",
	"playoff_lost",
];
const TEAM_COLS = [...TEAM_FIXED_COLS, ...TEAM_STAT_COLS];
const PLAYER_FIXED_COLS = [
	"gid",
	"tid",
	"pid",
	"name",
	"pos",
	"skills",
	"injury_type",
	"injury_games_remaining",
	"injury_new_this_game",
	"injury_playing_through",
	"injury_at_start",
];
const PLAYER_COLS = [...PLAYER_FIXED_COLS, ...PLAYER_STAT_COLS];
const SCORING_COLS = [
	"gid",
	"seq",
	"quarter",
	"clock",
	"tid",
	"pid",
	"passer_pid",
	"yds",
	"play_type",
	"made",
	"pts_scored",
];

const TD_TYPE_MAP = {
	run: "run",
	pass: "pass",
	kickoffReturn: "kickoff_return",
	puntReturn: "punt_return",
	fumbleRecovery: "fumble_recovery",
	interception: "interception",
};

function runMigrations(db) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			id     INTEGER PRIMARY KEY AUTOINCREMENT,
			name   TEXT NOT NULL UNIQUE,
			run_at TEXT NOT NULL
		)
	`);
	const applied = new Set(
		db
			.prepare("SELECT name FROM _migrations")
			.all()
			.map((r) => r.name),
	);
	if (!applied.has("001_box_scores")) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE games (
					gid          INTEGER PRIMARY KEY,
					season       INTEGER NOT NULL,
					day          INTEGER,
					att          INTEGER,
					overtimes    INTEGER NOT NULL DEFAULT 0,
					num_periods  INTEGER NOT NULL DEFAULT 4,
					playoffs     INTEGER NOT NULL DEFAULT 0,
					finals       INTEGER NOT NULL DEFAULT 0,
					neutral_site INTEGER NOT NULL DEFAULT 0,
					won_tid      INTEGER NOT NULL,
					won_pts      INTEGER NOT NULL,
					lost_tid     INTEGER NOT NULL,
					lost_pts     INTEGER NOT NULL
				);
				CREATE TABLE game_teams (
					id           INTEGER PRIMARY KEY,
					gid          INTEGER NOT NULL REFERENCES games(gid),
					tid          INTEGER NOT NULL,
					pts          INTEGER NOT NULL,
					pts_qtrs     TEXT NOT NULL,
					ovr          INTEGER,
					won          INTEGER,
					lost         INTEGER,
					tied         INTEGER,
					otl          INTEGER,
					playoff_seed  INTEGER,
					playoff_won  INTEGER,
					playoff_lost INTEGER,
					drives INTEGER, tot_start_yds INTEGER, time_pos INTEGER, sk_alw INTEGER,
					tp INTEGER, tpa INTEGER,
					pss_cmp INTEGER, pss INTEGER, pss_yds INTEGER, pss_td INTEGER,
					pss_int INTEGER, pss_lng INTEGER, pss_sk INTEGER, pss_sk_yds INTEGER,
					rus INTEGER, rus_yds INTEGER, rus_td INTEGER, rus_lng INTEGER,
					tgt INTEGER, rec INTEGER, rec_yds INTEGER, rec_td INTEGER, rec_lng INTEGER,
					pr INTEGER, pr_yds INTEGER, pr_td INTEGER, pr_lng INTEGER,
					kr INTEGER, kr_yds INTEGER, kr_td INTEGER, kr_lng INTEGER,
					def_int INTEGER, def_int_yds INTEGER, def_int_td INTEGER, def_int_lng INTEGER,
					def_pss_def INTEGER,
					def_fmb_frc INTEGER, def_fmb_rec INTEGER, def_fmb_yds INTEGER,
					def_fmb_td INTEGER, def_fmb_lng INTEGER,
					def_sk INTEGER, def_tck_solo INTEGER, def_tck_ast INTEGER,
					def_tck_loss INTEGER, def_sft INTEGER,
					fmb INTEGER, fmb_lost INTEGER,
					fg0 INTEGER, fga0 INTEGER, fg20 INTEGER, fga20 INTEGER,
					fg30 INTEGER, fga30 INTEGER, fg40 INTEGER, fga40 INTEGER,
					fg50 INTEGER, fga50 INTEGER, fg_lng INTEGER,
					xp INTEGER, xpa INTEGER,
					ko INTEGER, ko_yds INTEGER, ko_tb INTEGER,
					ok INTEGER, ok_rec INTEGER,
					pnt INTEGER, pnt_yds INTEGER, pnt_lng INTEGER,
					pnt_tb INTEGER, pnt_in20 INTEGER, pnt_blk INTEGER,
					pen INTEGER, pen_yds INTEGER,
					pbw INTEGER, pba INTEGER, rbw INTEGER, rba INTEGER,
					UNIQUE(gid, tid)
				);
				CREATE TABLE game_players (
					id                     INTEGER PRIMARY KEY,
					gid                    INTEGER NOT NULL REFERENCES games(gid),
					tid                    INTEGER NOT NULL,
					pid                    INTEGER NOT NULL,
					name                   TEXT NOT NULL,
					pos                    TEXT,
					skills                 TEXT,
					injury_type            TEXT,
					injury_games_remaining INTEGER,
					injury_new_this_game   INTEGER,
					injury_playing_through INTEGER,
					injury_at_start        TEXT,
					gp INTEGER, gs INTEGER, min REAL,
					fmb INTEGER, fmb_lost INTEGER,
					pss_cmp INTEGER, pss INTEGER, pss_yds INTEGER, pss_td INTEGER,
					pss_int INTEGER, pss_lng INTEGER, pss_sk INTEGER, pss_sk_yds INTEGER,
					rus INTEGER, rus_yds INTEGER, rus_td INTEGER, rus_lng INTEGER,
					tgt INTEGER, rec INTEGER, rec_yds INTEGER, rec_td INTEGER, rec_lng INTEGER,
					pr INTEGER, pr_yds INTEGER, pr_td INTEGER, pr_lng INTEGER,
					kr INTEGER, kr_yds INTEGER, kr_td INTEGER, kr_lng INTEGER,
					def_int INTEGER, def_int_yds INTEGER, def_int_td INTEGER, def_int_lng INTEGER,
					def_pss_def INTEGER,
					def_fmb_frc INTEGER, def_fmb_rec INTEGER, def_fmb_yds INTEGER,
					def_fmb_td INTEGER, def_fmb_lng INTEGER,
					def_sk INTEGER, def_tck_solo INTEGER, def_tck_ast INTEGER,
					def_tck_loss INTEGER, def_sft INTEGER,
					fg0 INTEGER, fga0 INTEGER, fg20 INTEGER, fga20 INTEGER,
					fg30 INTEGER, fga30 INTEGER, fg40 INTEGER, fga40 INTEGER,
					fg50 INTEGER, fga50 INTEGER, fg_lng INTEGER,
					xp INTEGER, xpa INTEGER,
					ko INTEGER, ko_yds INTEGER, ko_tb INTEGER,
					ok INTEGER, ok_rec INTEGER,
					pnt INTEGER, pnt_yds INTEGER, pnt_lng INTEGER,
					pnt_tb INTEGER, pnt_in20 INTEGER, pnt_blk INTEGER,
					pen INTEGER, pen_yds INTEGER,
					pbw INTEGER, pba INTEGER, rbw INTEGER, rba INTEGER,
					UNIQUE(gid, pid)
				);
				CREATE TABLE game_scoring_plays (
					id         INTEGER PRIMARY KEY,
					gid        INTEGER NOT NULL REFERENCES games(gid),
					seq        INTEGER NOT NULL,
					quarter    INTEGER NOT NULL,
					clock      INTEGER NOT NULL,
					tid        INTEGER NOT NULL,
					pid        INTEGER,
					passer_pid INTEGER,
					yds        INTEGER,
					play_type  TEXT NOT NULL,
					made       INTEGER,
					pts_scored INTEGER NOT NULL,
					UNIQUE(gid, seq)
				);
			`);
			db.prepare("INSERT INTO _migrations (name, run_at) VALUES (?, ?)").run(
				"001_box_scores",
				new Date().toISOString(),
			);
		})();
	}
	if (!applied.has("002_players")) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE players (
					pid                     INTEGER PRIMARY KEY,
					first_name              TEXT NOT NULL DEFAULT '',
					last_name               TEXT NOT NULL DEFAULT '',
					tid                     INTEGER NOT NULL,
					retired_year            INTEGER NOT NULL DEFAULT 9999,
					hof                     INTEGER NOT NULL DEFAULT 0,
					watch                   INTEGER,
					value                   REAL NOT NULL DEFAULT 0,
					value_no_pot            REAL NOT NULL DEFAULT 0,
					value_fuzz              REAL NOT NULL DEFAULT 0,
					value_no_pot_fuzz       REAL NOT NULL DEFAULT 0,
					roster_order            INTEGER NOT NULL DEFAULT 0,
					pt_modifier             REAL NOT NULL DEFAULT 1,
					games_until_tradable    INTEGER NOT NULL DEFAULT 0,
					num_days_free_agent     INTEGER NOT NULL DEFAULT 0,
					years_free_agent        INTEGER NOT NULL DEFAULT 0,
					born_year               INTEGER,
					born_loc                TEXT,
					college                 TEXT NOT NULL DEFAULT '',
					weight                  INTEGER NOT NULL DEFAULT 0,
					hgt                     INTEGER NOT NULL DEFAULT 0,
					img_url                 TEXT NOT NULL DEFAULT '',
					jersey_number           TEXT,
					pos                     TEXT,
					note                    TEXT,
					note_bool               INTEGER,
					real                    INTEGER,
					sr_id                   TEXT,
					died_year               INTEGER,
					draft_year              INTEGER NOT NULL DEFAULT 0,
					draft_round             INTEGER NOT NULL DEFAULT 0,
					draft_pick              INTEGER NOT NULL DEFAULT 0,
					draft_tid               INTEGER NOT NULL DEFAULT -1,
					draft_original_tid      INTEGER NOT NULL DEFAULT -1,
					draft_pot               INTEGER NOT NULL DEFAULT 0,
					draft_ovr               INTEGER NOT NULL DEFAULT 0,
					draft_skills            TEXT NOT NULL DEFAULT '[]',
					draft_dpid              INTEGER,
					injury_type             TEXT NOT NULL DEFAULT 'Healthy',
					injury_games_remaining  INTEGER NOT NULL DEFAULT 0,
					injury_score            INTEGER,
					contract_amount         REAL NOT NULL DEFAULT 0,
					contract_exp            INTEGER NOT NULL DEFAULT 0,
					face                    TEXT NOT NULL DEFAULT '{}',
					custom_mood_items       TEXT,
					num_players_traded_away TEXT,
					p_fatigue               REAL,
					num_consecutive_games_g INTEGER
				);
				CREATE INDEX idx_players_tid ON players(tid);
				CREATE INDEX idx_players_draft_retired ON players(draft_year, retired_year);
				CREATE INDEX idx_players_hof ON players(hof) WHERE hof = 1;
				CREATE INDEX idx_players_note ON players(note_bool) WHERE note_bool IS NOT NULL;
				CREATE INDEX idx_players_watch ON players(watch) WHERE watch IS NOT NULL;
				CREATE TABLE player_stats (
					id              INTEGER PRIMARY KEY,
					pid             INTEGER NOT NULL REFERENCES players(pid),
					season          INTEGER NOT NULL,
					tid             INTEGER NOT NULL,
					playoffs        INTEGER NOT NULL DEFAULT 0,
					years_with_team INTEGER NOT NULL DEFAULT 1,
					jersey_number   TEXT,
					av INTEGER, qb_w INTEGER, qb_l INTEGER, qb_t INTEGER, qb_otl INTEGER,
					gp INTEGER, gs INTEGER, min REAL,
					fmb INTEGER, fmb_lost INTEGER,
					pss_cmp INTEGER, pss INTEGER, pss_yds INTEGER, pss_td INTEGER,
					pss_int INTEGER, pss_lng INTEGER, pss_sk INTEGER, pss_sk_yds INTEGER,
					rus INTEGER, rus_yds INTEGER, rus_td INTEGER, rus_lng INTEGER,
					tgt INTEGER, rec INTEGER, rec_yds INTEGER, rec_td INTEGER, rec_lng INTEGER,
					pr INTEGER, pr_yds INTEGER, pr_td INTEGER, pr_lng INTEGER,
					kr INTEGER, kr_yds INTEGER, kr_td INTEGER, kr_lng INTEGER,
					def_int INTEGER, def_int_yds INTEGER, def_int_td INTEGER, def_int_lng INTEGER,
					def_pss_def INTEGER,
					def_fmb_frc INTEGER, def_fmb_rec INTEGER, def_fmb_yds INTEGER,
					def_fmb_td INTEGER, def_fmb_lng INTEGER,
					def_sk INTEGER, def_tck_solo INTEGER, def_tck_ast INTEGER,
					def_tck_loss INTEGER, def_sft INTEGER,
					fg0 INTEGER, fga0 INTEGER, fg20 INTEGER, fga20 INTEGER,
					fg30 INTEGER, fga30 INTEGER, fg40 INTEGER, fga40 INTEGER,
					fg50 INTEGER, fga50 INTEGER, fg_lng INTEGER,
					xp INTEGER, xpa INTEGER,
					ko INTEGER, ko_yds INTEGER, ko_tb INTEGER,
					ok INTEGER, ok_rec INTEGER,
					pnt INTEGER, pnt_yds INTEGER, pnt_lng INTEGER,
					pnt_tb INTEGER, pnt_in20 INTEGER, pnt_blk INTEGER,
					pen INTEGER, pen_yds INTEGER,
					pbw INTEGER, pba INTEGER, rbw INTEGER, rba INTEGER,
					sk_alw INTEGER,
					UNIQUE(pid, season, tid, playoffs)
				);
				CREATE TABLE player_ratings (
					id           INTEGER PRIMARY KEY,
					pid          INTEGER NOT NULL REFERENCES players(pid),
					season       INTEGER NOT NULL,
					seq          INTEGER NOT NULL,
					hgt INTEGER, stre INTEGER, spd INTEGER, endu INTEGER,
					thv INTEGER, thp INTEGER, tha INTEGER, bsc INTEGER,
					elu INTEGER, rtr INTEGER, hnd INTEGER, rbk INTEGER,
					pbk INTEGER, pcv INTEGER, tck INTEGER, prs INTEGER,
					rns INTEGER, kpw INTEGER, kac INTEGER, ppw INTEGER, pac INTEGER,
					fuzz REAL, ovr INTEGER, pot INTEGER, pos TEXT,
					ovr_qb INTEGER, ovr_rb INTEGER, ovr_wr INTEGER, ovr_te INTEGER,
					ovr_ol INTEGER, ovr_dl INTEGER, ovr_lb INTEGER, ovr_cb INTEGER,
					ovr_s  INTEGER, ovr_k  INTEGER, ovr_p  INTEGER, ovr_kr INTEGER, ovr_pr INTEGER,
					pot_qb INTEGER, pot_rb INTEGER, pot_wr INTEGER, pot_te INTEGER,
					pot_ol INTEGER, pot_dl INTEGER, pot_lb INTEGER, pot_cb INTEGER,
					pot_s  INTEGER, pot_k  INTEGER, pot_p  INTEGER, pot_kr INTEGER, pot_pr INTEGER,
					skills       TEXT NOT NULL DEFAULT '[]',
					injury_index INTEGER,
					locked       INTEGER,
					UNIQUE(pid, seq)
				);
				CREATE TABLE player_injuries (
					id       INTEGER PRIMARY KEY,
					pid      INTEGER NOT NULL REFERENCES players(pid),
					seq      INTEGER NOT NULL,
					season   INTEGER NOT NULL,
					games    INTEGER NOT NULL,
					type     TEXT NOT NULL,
					ovr_drop INTEGER,
					pot_drop INTEGER,
					UNIQUE(pid, seq)
				);
				CREATE TABLE player_salaries (
					id     INTEGER PRIMARY KEY,
					pid    INTEGER NOT NULL REFERENCES players(pid),
					season INTEGER NOT NULL,
					amount REAL NOT NULL,
					UNIQUE(pid, season)
				);
				CREATE TABLE player_awards (
					id     INTEGER PRIMARY KEY,
					pid    INTEGER NOT NULL REFERENCES players(pid),
					season INTEGER NOT NULL,
					type   TEXT NOT NULL,
					UNIQUE(pid, season, type)
				);
				CREATE TABLE player_relatives (
					id      INTEGER PRIMARY KEY,
					pid     INTEGER NOT NULL REFERENCES players(pid),
					type    TEXT NOT NULL,
					rel_pid INTEGER NOT NULL,
					name    TEXT NOT NULL,
					UNIQUE(pid, rel_pid)
				);
				CREATE TABLE player_mood_traits (
					id    INTEGER PRIMARY KEY,
					pid   INTEGER NOT NULL REFERENCES players(pid),
					trait TEXT NOT NULL,
					UNIQUE(pid, trait)
				);
				CREATE TABLE player_transactions (
					id       INTEGER PRIMARY KEY,
					pid      INTEGER NOT NULL REFERENCES players(pid),
					seq      INTEGER NOT NULL,
					season   INTEGER NOT NULL,
					phase    INTEGER NOT NULL,
					tid      INTEGER NOT NULL,
					type     TEXT NOT NULL,
					pick_num INTEGER,
					from_tid INTEGER,
					eid      INTEGER,
					UNIQUE(pid, seq)
				);
			`);
			db.prepare("INSERT INTO _migrations (name, run_at) VALUES (?, ?)").run(
				"002_players",
				new Date().toISOString(),
			);
		})();
	}
}

// ---- Player serialization helpers ----------------------------------------

function playerToRow(p) {
	return {
		pid: p.pid,
		first_name: p.firstName ?? "",
		last_name: p.lastName ?? "",
		tid: p.tid,
		retired_year: p.retiredYear ?? 9999,
		hof: p.hof ? 1 : 0,
		watch: p.watch ?? null,
		value: p.value ?? 0,
		value_no_pot: p.valueNoPot ?? 0,
		value_fuzz: p.valueFuzz ?? 0,
		value_no_pot_fuzz: p.valueNoPotFuzz ?? 0,
		roster_order: p.rosterOrder ?? 0,
		pt_modifier: p.ptModifier ?? 1,
		games_until_tradable: p.gamesUntilTradable ?? 0,
		num_days_free_agent: p.numDaysFreeAgent ?? 0,
		years_free_agent: p.yearsFreeAgent ?? 0,
		born_year: p.born?.year ?? null,
		born_loc: p.born?.loc ?? null,
		college: p.college ?? "",
		weight: p.weight ?? 0,
		hgt: p.hgt ?? 0,
		img_url: p.imgURL ?? "",
		jersey_number: p.jerseyNumber ?? null,
		pos: p.pos ?? null,
		note: p.note ?? null,
		note_bool: p.noteBool ?? null,
		real: p.real ? 1 : null,
		sr_id: p.srID ?? null,
		died_year: p.diedYear ?? null,
		draft_year: p.draft?.year ?? 0,
		draft_round: p.draft?.round ?? 0,
		draft_pick: p.draft?.pick ?? 0,
		draft_tid: p.draft?.tid ?? -1,
		draft_original_tid: p.draft?.originalTid ?? -1,
		draft_pot: p.draft?.pot ?? 0,
		draft_ovr: p.draft?.ovr ?? 0,
		draft_skills: JSON.stringify(p.draft?.skills ?? []),
		draft_dpid: p.draft?.dpid ?? null,
		injury_type: p.injury?.type ?? "Healthy",
		injury_games_remaining: p.injury?.gamesRemaining ?? 0,
		injury_score: p.injury?.score ?? null,
		contract_amount: p.contract?.amount ?? 0,
		contract_exp: p.contract?.exp ?? 0,
		face: JSON.stringify(p.face ?? {}),
		custom_mood_items:
			p.customMoodItems != null ? JSON.stringify(p.customMoodItems) : null,
		num_players_traded_away:
			p.numPlayersTradedAwayNormalized != null
				? JSON.stringify(p.numPlayersTradedAwayNormalized)
				: null,
		p_fatigue: p.pFatigue ?? null,
		num_consecutive_games_g: p.numConsecutiveGamesG ?? null,
	};
}

function statsToRow(pid, s) {
	const row = {
		pid,
		season: s.season,
		tid: s.tid,
		playoffs: s.playoffs ? 1 : 0,
		years_with_team: s.yearsWithTeam ?? 1,
		jersey_number: s.jerseyNumber ?? null,
	};
	for (let i = 0; i < CAREER_STAT_KEYS.length; i++) {
		row[CAREER_STAT_COLS[i]] = s[CAREER_STAT_KEYS[i]] ?? null;
	}
	return row;
}

function ratingsToRow(pid, seq, r) {
	const row = { pid, season: r.season, seq };
	for (const k of RATING_KEYS) {
		row[k] = r[k] ?? null;
	}
	row.fuzz = r.fuzz ?? null;
	row.ovr = r.ovr ?? null;
	row.pot = r.pot ?? null;
	row.pos = r.pos ?? null;
	row.skills = JSON.stringify(r.skills ?? []);
	row.injury_index = r.injuryIndex ?? null;
	row.locked = r.locked ? 1 : null;
	for (const pos of FOOTBALL_POSITIONS) {
		const lp = pos.toLowerCase();
		row[`ovr_${lp}`] = r.ovrs?.[pos] ?? null;
		row[`pot_${lp}`] = r.pots?.[pos] ?? null;
	}
	return row;
}

function rowToPlayer(row, childRows) {
	const {
		stats,
		ratings,
		injuries,
		salaries,
		awards,
		relatives,
		moodTraits,
		transactions,
	} = childRows;
	const p = {
		pid: row.pid,
		firstName: row.first_name,
		lastName: row.last_name,
		tid: row.tid,
		retiredYear: row.retired_year,
		hof: row.hof === 1,
		watch: row.watch ?? undefined,
		value: row.value,
		valueNoPot: row.value_no_pot,
		valueFuzz: row.value_fuzz,
		valueNoPotFuzz: row.value_no_pot_fuzz,
		rosterOrder: row.roster_order,
		ptModifier: row.pt_modifier,
		gamesUntilTradable: row.games_until_tradable,
		numDaysFreeAgent: row.num_days_free_agent,
		yearsFreeAgent: row.years_free_agent,
		born: { year: row.born_year, loc: row.born_loc ?? "" },
		college: row.college,
		weight: row.weight,
		hgt: row.hgt,
		imgURL: row.img_url,
		jerseyNumber: row.jersey_number ?? undefined,
		pos: row.pos ?? undefined,
		note: row.note ?? undefined,
		noteBool: row.note_bool ?? undefined,
		real: row.real === 1 ? true : undefined,
		srID: row.sr_id ?? undefined,
		diedYear: row.died_year ?? undefined,
		draft: {
			year: row.draft_year,
			round: row.draft_round,
			pick: row.draft_pick,
			tid: row.draft_tid,
			originalTid: row.draft_original_tid,
			pot: row.draft_pot,
			ovr: row.draft_ovr,
			skills: JSON.parse(row.draft_skills ?? "[]"),
			dpid: row.draft_dpid ?? undefined,
		},
		injury: {
			type: row.injury_type,
			gamesRemaining: row.injury_games_remaining,
			score: row.injury_score ?? undefined,
		},
		contract: {
			amount: row.contract_amount,
			exp: row.contract_exp,
		},
		face: JSON.parse(row.face ?? "{}"),
		customMoodItems:
			row.custom_mood_items != null
				? JSON.parse(row.custom_mood_items)
				: undefined,
		numPlayersTradedAwayNormalized:
			row.num_players_traded_away != null
				? JSON.parse(row.num_players_traded_away)
				: undefined,
		pFatigue: row.p_fatigue ?? undefined,
		numConsecutiveGamesG: row.num_consecutive_games_g ?? undefined,
		stats: stats.map((sr) => {
			const s = {
				season: sr.season,
				tid: sr.tid,
				playoffs: sr.playoffs === 1,
				yearsWithTeam: sr.years_with_team,
				jerseyNumber: sr.jersey_number ?? undefined,
			};
			for (let i = 0; i < CAREER_STAT_KEYS.length; i++) {
				const v = sr[CAREER_STAT_COLS[i]];
				s[CAREER_STAT_KEYS[i]] = v ?? 0;
			}
			return s;
		}),
		ratings: ratings.map((rr) => {
			const r = {
				season: rr.season,
				fuzz: rr.fuzz ?? 0,
				ovr: rr.ovr ?? 0,
				pot: rr.pot ?? 0,
				pos: rr.pos ?? "",
				skills: JSON.parse(rr.skills ?? "[]"),
				ovrs: {},
				pots: {},
			};
			for (const k of RATING_KEYS) r[k] = rr[k] ?? 0;
			if (rr.injury_index != null) r.injuryIndex = rr.injury_index;
			if (rr.locked) r.locked = true;
			for (const pos of FOOTBALL_POSITIONS) {
				const lp = pos.toLowerCase();
				r.ovrs[pos] = rr[`ovr_${lp}`] ?? 0;
				r.pots[pos] = rr[`pot_${lp}`] ?? 0;
			}
			return r;
		}),
		injuries: injuries.map((ir) => ({
			season: ir.season,
			games: ir.games,
			type: ir.type,
			ovrDrop: ir.ovr_drop ?? undefined,
			potDrop: ir.pot_drop ?? undefined,
		})),
		salaries: salaries.map((sr) => ({ season: sr.season, amount: sr.amount })),
		awards: awards.map((ar) => ({ season: ar.season, type: ar.type })),
		relatives: relatives.map((rr) => ({
			type: rr.type,
			pid: rr.rel_pid,
			name: rr.name,
		})),
		moodTraits: moodTraits.map((mr) => mr.trait),
		transactions: transactions.map((tr) => {
			const t = {
				season: tr.season,
				phase: tr.phase,
				tid: tr.tid,
				type: tr.type,
			};
			if (tr.pick_num != null) t.pickNum = tr.pick_num;
			if (tr.from_tid != null) t.fromTid = tr.from_tid;
			if (tr.eid != null) t.eid = tr.eid;
			return t;
		}),
	};
	// Strip undefined fields to keep objects clean
	for (const k of Object.keys(p)) {
		if (p[k] === undefined) delete p[k];
	}
	return p;
}

function _buildPlayerStmts(db) {
	const buildInsert = (table, cols) =>
		`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`;
	return {
		upsertPlayer: db.prepare(buildInsert("players", PLAYER_TABLE_COLS)),
		upsertStats: db.prepare(buildInsert("player_stats", PS_ALL_COLS)),
		upsertRatings: db.prepare(buildInsert("player_ratings", PR_ALL_COLS)),
		upsertInjury: db.prepare(
			`INSERT OR REPLACE INTO player_injuries (pid, seq, season, games, type, ovr_drop, pot_drop) VALUES (@pid, @seq, @season, @games, @type, @ovr_drop, @pot_drop)`,
		),
		upsertSalary: db.prepare(
			`INSERT OR REPLACE INTO player_salaries (pid, season, amount) VALUES (@pid, @season, @amount)`,
		),
		upsertAward: db.prepare(
			`INSERT OR REPLACE INTO player_awards (pid, season, type) VALUES (@pid, @season, @type)`,
		),
		upsertRelative: db.prepare(
			`INSERT OR REPLACE INTO player_relatives (pid, type, rel_pid, name) VALUES (@pid, @type, @rel_pid, @name)`,
		),
		upsertMoodTrait: db.prepare(
			`INSERT OR REPLACE INTO player_mood_traits (pid, trait) VALUES (@pid, @trait)`,
		),
		upsertTransaction: db.prepare(
			`INSERT OR REPLACE INTO player_transactions (pid, seq, season, phase, tid, type, pick_num, from_tid, eid) VALUES (@pid, @seq, @season, @phase, @tid, @type, @pick_num, @from_tid, @eid)`,
		),
		deleteChildTable: (table) =>
			db.prepare(`DELETE FROM ${table} WHERE pid = ?`),
	};
}

const _playerStmts = new Map();
function getPlayerStmts(db) {
	if (_playerStmts.has(db)) return _playerStmts.get(db);
	const s = _buildPlayerStmts(db);
	_playerStmts.set(db, s);
	return s;
}

export function writePlayers(db, players, deletePids = []) {
	const s = getPlayerStmts(db);
	const childTables = [
		"player_stats",
		"player_ratings",
		"player_injuries",
		"player_salaries",
		"player_awards",
		"player_relatives",
		"player_mood_traits",
		"player_transactions",
	];
	const deleteChild = (table) =>
		db.prepare(`DELETE FROM ${table} WHERE pid = ?`);

	db.transaction(() => {
		for (const pid of deletePids) {
			for (const table of childTables) deleteChild(table).run(pid);
			db.prepare("DELETE FROM players WHERE pid = ?").run(pid);
		}
		for (const p of players) {
			const pid = p.pid;
			s.upsertPlayer.run(playerToRow(p));
			// Delete and reinsert children (simplest correct strategy)
			for (const table of childTables) deleteChild(table).run(pid);
			for (const stat of p.stats ?? [])
				s.upsertStats.run(statsToRow(pid, stat));
			for (let i = 0; i < (p.ratings ?? []).length; i++) {
				s.upsertRatings.run(ratingsToRow(pid, i, p.ratings[i]));
			}
			for (let i = 0; i < (p.injuries ?? []).length; i++) {
				const inj = p.injuries[i];
				s.upsertInjury.run({
					pid,
					seq: i,
					season: inj.season,
					games: inj.games,
					type: inj.type,
					ovr_drop: inj.ovrDrop ?? null,
					pot_drop: inj.potDrop ?? null,
				});
			}
			for (const sal of p.salaries ?? [])
				s.upsertSalary.run({ pid, season: sal.season, amount: sal.amount });
			for (const aw of p.awards ?? [])
				s.upsertAward.run({ pid, season: aw.season, type: aw.type });
			for (const rel of p.relatives ?? [])
				s.upsertRelative.run({
					pid,
					type: rel.type,
					rel_pid: rel.pid,
					name: rel.name,
				});
			for (const trait of p.moodTraits ?? [])
				s.upsertMoodTrait.run({ pid, trait });
			for (let i = 0; i < (p.transactions ?? []).length; i++) {
				const tx = p.transactions[i];
				s.upsertTransaction.run({
					pid,
					seq: i,
					season: tx.season,
					phase: tx.phase,
					tid: tx.tid,
					type: tx.type,
					pick_num: tx.pickNum ?? null,
					from_tid: tx.fromTid ?? null,
					eid: tx.eid ?? null,
				});
			}
		}
	})();
}

function _loadChildRows(db, pids) {
	if (pids.length === 0)
		return {
			stats: [],
			ratings: [],
			injuries: [],
			salaries: [],
			awards: [],
			relatives: [],
			moodTraits: [],
			transactions: [],
		};
	const ph = pids.map(() => "?").join(", ");
	return {
		stats: db
			.prepare(
				`SELECT * FROM player_stats WHERE pid IN (${ph}) ORDER BY pid, season, playoffs`,
			)
			.all(...pids),
		ratings: db
			.prepare(
				`SELECT * FROM player_ratings WHERE pid IN (${ph}) ORDER BY pid, seq`,
			)
			.all(...pids),
		injuries: db
			.prepare(
				`SELECT * FROM player_injuries WHERE pid IN (${ph}) ORDER BY pid, seq`,
			)
			.all(...pids),
		salaries: db
			.prepare(
				`SELECT * FROM player_salaries WHERE pid IN (${ph}) ORDER BY pid, season`,
			)
			.all(...pids),
		awards: db
			.prepare(
				`SELECT * FROM player_awards WHERE pid IN (${ph}) ORDER BY pid, season`,
			)
			.all(...pids),
		relatives: db
			.prepare(
				`SELECT * FROM player_relatives WHERE pid IN (${ph}) ORDER BY pid`,
			)
			.all(...pids),
		moodTraits: db
			.prepare(
				`SELECT * FROM player_mood_traits WHERE pid IN (${ph}) ORDER BY pid`,
			)
			.all(...pids),
		transactions: db
			.prepare(
				`SELECT * FROM player_transactions WHERE pid IN (${ph}) ORDER BY pid, seq`,
			)
			.all(...pids),
	};
}

function _assemblePlayersFromRows(playerRows, childBatch) {
	const {
		stats,
		ratings,
		injuries,
		salaries,
		awards,
		relatives,
		moodTraits,
		transactions,
	} = childBatch;
	const byPid = (arr, pidField = "pid") => {
		const m = new Map();
		for (const r of arr) {
			const k = r[pidField];
			let a = m.get(k);
			if (!a) {
				a = [];
				m.set(k, a);
			}
			a.push(r);
		}
		return m;
	};
	const statsMap = byPid(stats);
	const ratingsMap = byPid(ratings);
	const injuriesMap = byPid(injuries);
	const salariesMap = byPid(salaries);
	const awardsMap = byPid(awards);
	const relativesMap = byPid(relatives);
	const moodTraitsMap = byPid(moodTraits);
	const transactionsMap = byPid(transactions);

	return playerRows.map((row) =>
		rowToPlayer(row, {
			stats: statsMap.get(row.pid) ?? [],
			ratings: ratingsMap.get(row.pid) ?? [],
			injuries: injuriesMap.get(row.pid) ?? [],
			salaries: salariesMap.get(row.pid) ?? [],
			awards: awardsMap.get(row.pid) ?? [],
			relatives: relativesMap.get(row.pid) ?? [],
			moodTraits: moodTraitsMap.get(row.pid) ?? [],
			transactions: transactionsMap.get(row.pid) ?? [],
		}),
	);
}

export function readActivePlayers(db) {
	// Active = not fully retired (tid >= -2 or UNDRAFTED_FANTASY_TEMP=-6)
	const playerRows = db
		.prepare("SELECT * FROM players WHERE tid >= -2 OR tid = -6")
		.all();
	if (playerRows.length === 0) return [];
	const pids = playerRows.map((r) => r.pid);
	return _assemblePlayersFromRows(playerRows, _loadChildRows(db, pids));
}

export function readPlayersFilter(db, filter) {
	let playerRows;
	if (filter.pid !== undefined) {
		playerRows = db
			.prepare("SELECT * FROM players WHERE pid = ?")
			.all(filter.pid);
	} else if (filter.pids !== undefined) {
		const ph = filter.pids.map(() => "?").join(", ");
		playerRows = db
			.prepare(`SELECT * FROM players WHERE pid IN (${ph})`)
			.all(...filter.pids);
	} else if (filter.tid !== undefined) {
		playerRows = db
			.prepare("SELECT * FROM players WHERE tid = ?")
			.all(filter.tid);
	} else if (filter.retiredYear !== undefined) {
		playerRows = db
			.prepare("SELECT * FROM players WHERE retired_year = ?")
			.all(filter.retiredYear);
	} else if (filter.draftYear !== undefined) {
		playerRows = db
			.prepare(
				"SELECT * FROM players WHERE draft_year = ? AND retired_year = 9999",
			)
			.all(filter.draftYear);
	} else if (filter.hof) {
		playerRows = db.prepare("SELECT * FROM players WHERE hof = 1").all();
	} else if (filter.note) {
		playerRows = db
			.prepare("SELECT * FROM players WHERE note_bool IS NOT NULL")
			.all();
	} else if (filter.watch) {
		playerRows = db
			.prepare("SELECT * FROM players WHERE watch IS NOT NULL")
			.all();
	} else if (filter.statsTid !== undefined) {
		playerRows = db
			.prepare(
				"SELECT DISTINCT p.* FROM players p JOIN player_stats ps ON ps.pid = p.pid WHERE ps.tid = ?",
			)
			.all(filter.statsTid);
	} else if (filter.activeAndRetired) {
		playerRows = db.prepare("SELECT * FROM players").all();
	} else if (filter.activeSeason !== undefined) {
		playerRows = db
			.prepare(
				"SELECT DISTINCT p.* FROM players p JOIN player_stats ps ON ps.pid = p.pid WHERE ps.season = ?",
			)
			.all(filter.activeSeason);
	} else {
		playerRows = db.prepare("SELECT * FROM players").all();
	}
	if (playerRows.length === 0) return [];
	const pids = playerRows.map((r) => r.pid);
	return _assemblePlayersFromRows(playerRows, _loadChildRows(db, pids));
}

export function countPlayers(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM players").get()?.n ?? 0;
}

// ---- End player helpers --------------------------------------------------

const _dbs = new Map();

export function openDb(dbDir, lid) {
	const key = String(lid);
	if (_dbs.has(key)) return _dbs.get(key);
	fs.mkdirSync(dbDir, { recursive: true });
	const dbPath = path.join(dbDir, `league-${lid}.db`);
	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	runMigrations(db);
	_dbs.set(key, db);
	console.log(`[SQLite] opened ${dbPath}`);
	return db;
}

// Cached prepared statements per DB
const _stmts = new Map();

function getStmts(db) {
	if (_stmts.has(db)) return _stmts.get(db);
	const buildInsert = (table, cols) =>
		`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`;
	const stmts = {
		insertGame: db.prepare(buildInsert("games", GAME_COLS)),
		insertTeam: db.prepare(buildInsert("game_teams", TEAM_COLS)),
		insertPlayer: db.prepare(buildInsert("game_players", PLAYER_COLS)),
		insertScoringPlay: db.prepare(
			buildInsert("game_scoring_plays", SCORING_COLS),
		),
	};
	_stmts.set(db, stmts);
	return stmts;
}

export function writeGame(db, gameStats) {
	const { insertGame, insertTeam, insertPlayer, insertScoringPlay } =
		getStmts(db);

	const nameToPid = new Map();
	for (const team of gameStats.teams) {
		for (const player of team.players) {
			nameToPid.set(player.name, player.pid);
		}
	}

	db.transaction(() => {
		insertGame.run({
			gid: gameStats.gid,
			season: gameStats.season,
			day: gameStats.day ?? null,
			att: gameStats.att,
			overtimes: gameStats.overtimes,
			num_periods: gameStats.numPeriods ?? 4,
			playoffs: gameStats.playoffs ? 1 : 0,
			finals: gameStats.finals ? 1 : 0,
			neutral_site: gameStats.neutralSite ? 1 : 0,
			won_tid: gameStats.won.tid,
			won_pts: gameStats.won.pts,
			lost_tid: gameStats.lost.tid,
			lost_pts: gameStats.lost.pts,
		});

		for (const team of gameStats.teams) {
			const row = {
				gid: gameStats.gid,
				tid: team.tid,
				pts: team.pts,
				pts_qtrs: JSON.stringify(team.ptsQtrs ?? []),
				ovr: team.ovr ?? null,
				won: team.won ?? null,
				lost: team.lost ?? null,
				tied: team.tied ?? null,
				otl: team.otl ?? null,
				playoff_seed: team.playoffs?.seed ?? null,
				playoff_won: team.playoffs?.won ?? null,
				playoff_lost: team.playoffs?.lost ?? null,
			};
			for (let i = 0; i < TEAM_STAT_KEYS.length; i++) {
				row[TEAM_STAT_COLS[i]] = team[TEAM_STAT_KEYS[i]] ?? null;
			}
			insertTeam.run(row);
		}

		for (const team of gameStats.teams) {
			for (const player of team.players) {
				const row = {
					gid: gameStats.gid,
					tid: team.tid,
					pid: player.pid,
					name: player.name,
					pos: player.pos ?? null,
					skills: JSON.stringify(player.skills ?? []),
					injury_type: player.injury?.type ?? null,
					injury_games_remaining: player.injury?.gamesRemaining ?? null,
					injury_new_this_game: player.injury?.newThisGame ? 1 : null,
					injury_playing_through: player.injury?.playingThrough ? 1 : null,
					injury_at_start: player.injuryAtStart ?? null,
				};
				for (let i = 0; i < PLAYER_STAT_KEYS.length; i++) {
					row[PLAYER_STAT_COLS[i]] = player[PLAYER_STAT_KEYS[i]] ?? null;
				}
				insertPlayer.run(row);
			}
		}

		const scoringSummary = gameStats.scoringSummary ?? [];
		for (const [seq, event] of scoringSummary.entries()) {
			const names = event.names ?? [];
			const t = event.t ?? 0;
			let playType, ptsScored;
			let pid = null,
				passerPid = null;
			let yds = event.yds ?? null;
			let made = null;
			let tid = gameStats.teams[t]?.tid ?? null;

			if (event.type === "fieldGoal") {
				playType = "field_goal";
				made = event.made ? 1 : 0;
				ptsScored = event.made ? 3 : 0;
				pid = names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
			} else if (event.type === "extraPoint") {
				playType = "extra_point";
				made = event.made ? 1 : 0;
				ptsScored = event.made ? 1 : 0;
				pid = names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
				yds = null;
			} else if (event.type === "twoPointConversionFailed") {
				playType = "two_point_failed";
				ptsScored = 0;
				yds = null;
			} else if (event.type === "shootoutShot") {
				playType = "shootout_shot";
				made = event.made ? 1 : 0;
				ptsScored = event.made ? 1 : 0;
				pid = names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
				yds = null;
			} else if (event.safety) {
				tid = gameStats.teams[1 - t]?.tid ?? null;
				playType = "safety";
				ptsScored = 2;
				yds = null;
			} else if (event.td) {
				playType = TD_TYPE_MAP[event.type] ?? event.type;
				ptsScored = 6;
				if (event.type === "pass") {
					passerPid =
						names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
					pid =
						names[1] !== undefined ? (nameToPid.get(names[1]) ?? null) : null;
				} else {
					pid =
						names[0] !== undefined ? (nameToPid.get(names[0]) ?? null) : null;
				}
			} else {
				continue;
			}

			insertScoringPlay.run({
				gid: gameStats.gid,
				seq,
				quarter: event.quarter,
				clock: event.clock,
				tid,
				pid,
				passer_pid: passerPid,
				yds,
				play_type: playType,
				made,
				pts_scored: ptsScored,
			});
		}
	})();
}

export function readGames(db, filter) {
	const { gid, season } = filter;
	let gameRows;
	if (gid !== undefined) {
		gameRows = db.prepare("SELECT * FROM games WHERE gid = ?").all(gid);
	} else if (season !== undefined) {
		gameRows = db.prepare("SELECT * FROM games WHERE season = ?").all(season);
	} else {
		gameRows = db.prepare("SELECT * FROM games").all();
	}
	if (gameRows.length === 0)
		return { gameRows: [], teamRows: [], playerRows: [], scoringRows: [] };

	const gids = gameRows.map((r) => r.gid);
	const inn = `(${gids.map(() => "?").join(", ")})`;
	const teamRows = db
		.prepare(`SELECT * FROM game_teams WHERE gid IN ${inn} ORDER BY rowid`)
		.all(...gids);
	const playerRows = db
		.prepare(`SELECT * FROM game_players WHERE gid IN ${inn}`)
		.all(...gids);
	const scoringRows = db
		.prepare(
			`SELECT * FROM game_scoring_plays WHERE gid IN ${inn} ORDER BY seq`,
		)
		.all(...gids);
	return { gameRows, teamRows, playerRows, scoringRows };
}

export function getMaxGid(db) {
	const row = db.prepare("SELECT MAX(gid) AS max FROM games").get();
	return row?.max ?? -1;
}
