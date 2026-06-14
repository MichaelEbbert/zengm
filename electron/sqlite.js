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

// ---- Team-domain constants -------------------------------------------

const TEAM_SEASON_STAT_RAW = [
	"drives",
	"totStartYds",
	"timePos",
	"pts",
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
	"tp",
	"tpa",
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
	"skAlw",
];
const _upperFirst = (s) => s[0].toUpperCase() + s.slice(1);
const TEAM_STATS_KEYS = [
	"gp",
	"min",
	...TEAM_SEASON_STAT_RAW,
	...TEAM_SEASON_STAT_RAW.map((s) => `opp${_upperFirst(s)}`),
];
const TEAM_STATS_COLS = TEAM_STATS_KEYS.map(toSnake);

const TEAM_TABLE_COLS = [
	"tid",
	"cid",
	"did",
	"region",
	"name",
	"abbrev",
	"img_url",
	"img_url_small",
	"jersey",
	"colors",
	"strategy",
	"pop",
	"stadium_capacity",
	"adjust_for_inflation",
	"disabled",
	"keep_roster_sorted",
	"budget_ticket_price",
	"budget_scouting",
	"budget_coaching",
	"budget_health",
	"budget_facilities",
	"initial_budget_scouting",
	"initial_budget_coaching",
	"initial_budget_health",
	"initial_budget_facilities",
	"play_through_injuries",
	"depth",
	"first_season_after_expansion",
	"sr_id",
	"auto_ticket_price",
	"retired_jersey_numbers",
	"cola",
	"cola_opt_out",
];

const TS_FIXED_COLS = [
	"rid",
	"tid",
	"season",
	"gp_home",
	"att",
	"cash",
	"won",
	"lost",
	"tied",
	"otl",
	"won_home",
	"lost_home",
	"tied_home",
	"otl_home",
	"won_away",
	"lost_away",
	"tied_away",
	"otl_away",
	"won_div",
	"lost_div",
	"tied_div",
	"otl_div",
	"won_conf",
	"lost_conf",
	"tied_conf",
	"otl_conf",
	"last_ten",
	"streak",
	"playoff_rounds_won",
	"hype",
	"pop",
	"stadium_capacity",
	"payroll_end_of_season",
	"num_players_traded_away",
	"note",
	"note_bool",
	"clinched_playoffs",
	"avg_age",
	"ovr_start",
	"ovr_end",
	"rev_luxury_tax_share",
	"rev_merch",
	"rev_sponsor",
	"rev_ticket",
	"rev_national_tv",
	"rev_local_tv",
	"exp_luxury_tax",
	"exp_min_tax",
	"exp_salary",
	"exp_coaching",
	"exp_health",
	"exp_facilities",
	"exp_scouting",
	"exp_level_coaching",
	"exp_level_facilities",
	"exp_level_health",
	"exp_level_scouting",
	"owner_mood_money",
	"owner_mood_playoffs",
	"owner_mood_wins",
	"cid",
	"did",
	"region",
	"name",
	"abbrev",
	"img_url",
	"img_url_small",
	"jersey",
	"colors",
	"sr_id",
];

const TST_ALL_COLS = ["rid", "tid", "season", "playoffs", ...TEAM_STATS_COLS];

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
	if (!applied.has("003_teams")) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE teams (
					tid                       INTEGER PRIMARY KEY,
					cid                       INTEGER NOT NULL,
					did                       INTEGER NOT NULL,
					region                    TEXT NOT NULL DEFAULT '',
					name                      TEXT NOT NULL DEFAULT '',
					abbrev                    TEXT NOT NULL DEFAULT '',
					img_url                   TEXT,
					img_url_small             TEXT,
					jersey                    TEXT,
					colors                    TEXT NOT NULL DEFAULT '["#000000","#ffffff","#cccccc"]',
					strategy                  TEXT NOT NULL DEFAULT 'contending',
					pop                       REAL NOT NULL DEFAULT 0,
					stadium_capacity          INTEGER NOT NULL DEFAULT 25000,
					adjust_for_inflation      INTEGER NOT NULL DEFAULT 1,
					disabled                  INTEGER NOT NULL DEFAULT 0,
					keep_roster_sorted        INTEGER NOT NULL DEFAULT 1,
					budget_ticket_price       REAL NOT NULL DEFAULT 0,
					budget_scouting           INTEGER NOT NULL DEFAULT 0,
					budget_coaching           INTEGER NOT NULL DEFAULT 0,
					budget_health             INTEGER NOT NULL DEFAULT 0,
					budget_facilities         INTEGER NOT NULL DEFAULT 0,
					initial_budget_scouting   INTEGER NOT NULL DEFAULT 0,
					initial_budget_coaching   INTEGER NOT NULL DEFAULT 0,
					initial_budget_health     INTEGER NOT NULL DEFAULT 0,
					initial_budget_facilities INTEGER NOT NULL DEFAULT 0,
					play_through_injuries     TEXT NOT NULL DEFAULT '[0,0]',
					depth                     TEXT,
					first_season_after_expansion INTEGER,
					sr_id                     TEXT,
					auto_ticket_price         INTEGER,
					retired_jersey_numbers    TEXT,
					cola                      REAL,
					cola_opt_out              INTEGER
				);
				CREATE TABLE team_seasons (
					rid                   INTEGER PRIMARY KEY AUTOINCREMENT,
					tid                   INTEGER NOT NULL,
					season                INTEGER NOT NULL,
					gp_home               INTEGER NOT NULL DEFAULT 0,
					att                   INTEGER NOT NULL DEFAULT 0,
					cash                  REAL NOT NULL DEFAULT 0,
					won                   INTEGER NOT NULL DEFAULT 0,
					lost                  INTEGER NOT NULL DEFAULT 0,
					tied                  INTEGER NOT NULL DEFAULT 0,
					otl                   INTEGER NOT NULL DEFAULT 0,
					won_home              INTEGER NOT NULL DEFAULT 0,
					lost_home             INTEGER NOT NULL DEFAULT 0,
					tied_home             INTEGER NOT NULL DEFAULT 0,
					otl_home              INTEGER NOT NULL DEFAULT 0,
					won_away              INTEGER NOT NULL DEFAULT 0,
					lost_away             INTEGER NOT NULL DEFAULT 0,
					tied_away             INTEGER NOT NULL DEFAULT 0,
					otl_away              INTEGER NOT NULL DEFAULT 0,
					won_div               INTEGER NOT NULL DEFAULT 0,
					lost_div              INTEGER NOT NULL DEFAULT 0,
					tied_div              INTEGER NOT NULL DEFAULT 0,
					otl_div               INTEGER NOT NULL DEFAULT 0,
					won_conf              INTEGER NOT NULL DEFAULT 0,
					lost_conf             INTEGER NOT NULL DEFAULT 0,
					tied_conf             INTEGER NOT NULL DEFAULT 0,
					otl_conf              INTEGER NOT NULL DEFAULT 0,
					last_ten              TEXT NOT NULL DEFAULT '[]',
					streak                INTEGER NOT NULL DEFAULT 0,
					playoff_rounds_won    INTEGER NOT NULL DEFAULT -1,
					hype                  REAL NOT NULL DEFAULT 0.5,
					pop                   REAL NOT NULL DEFAULT 0,
					stadium_capacity      INTEGER NOT NULL DEFAULT 0,
					payroll_end_of_season REAL NOT NULL DEFAULT 0,
					num_players_traded_away INTEGER NOT NULL DEFAULT 0,
					note                  TEXT,
					note_bool             INTEGER,
					clinched_playoffs     TEXT,
					avg_age               REAL,
					ovr_start             INTEGER,
					ovr_end               INTEGER,
					rev_luxury_tax_share  REAL NOT NULL DEFAULT 0,
					rev_merch             REAL NOT NULL DEFAULT 0,
					rev_sponsor           REAL NOT NULL DEFAULT 0,
					rev_ticket            REAL NOT NULL DEFAULT 0,
					rev_national_tv       REAL NOT NULL DEFAULT 0,
					rev_local_tv          REAL NOT NULL DEFAULT 0,
					exp_luxury_tax        REAL NOT NULL DEFAULT 0,
					exp_min_tax           REAL NOT NULL DEFAULT 0,
					exp_salary            REAL NOT NULL DEFAULT 0,
					exp_coaching          REAL NOT NULL DEFAULT 0,
					exp_health            REAL NOT NULL DEFAULT 0,
					exp_facilities        REAL NOT NULL DEFAULT 0,
					exp_scouting          REAL NOT NULL DEFAULT 0,
					exp_level_coaching    REAL NOT NULL DEFAULT 0,
					exp_level_facilities  REAL NOT NULL DEFAULT 0,
					exp_level_health      REAL NOT NULL DEFAULT 0,
					exp_level_scouting    REAL NOT NULL DEFAULT 0,
					owner_mood_money      REAL,
					owner_mood_playoffs   REAL,
					owner_mood_wins       REAL,
					cid                   INTEGER NOT NULL DEFAULT 0,
					did                   INTEGER NOT NULL DEFAULT 0,
					region                TEXT NOT NULL DEFAULT '',
					name                  TEXT NOT NULL DEFAULT '',
					abbrev                TEXT NOT NULL DEFAULT '',
					img_url               TEXT,
					img_url_small         TEXT,
					jersey                TEXT,
					colors                TEXT NOT NULL DEFAULT '["#000000","#ffffff","#cccccc"]',
					sr_id                 TEXT,
					UNIQUE(season, tid)
				);
				CREATE INDEX idx_team_seasons_tid_season ON team_seasons(tid, season);
				CREATE INDEX idx_team_seasons_note ON team_seasons(note_bool) WHERE note_bool IS NOT NULL;
				CREATE TABLE team_stats (
					rid        INTEGER PRIMARY KEY AUTOINCREMENT,
					tid        INTEGER NOT NULL,
					season     INTEGER NOT NULL,
					playoffs   INTEGER NOT NULL DEFAULT 0,
					gp INTEGER NOT NULL DEFAULT 0, min REAL NOT NULL DEFAULT 0,
					drives INTEGER NOT NULL DEFAULT 0, tot_start_yds INTEGER NOT NULL DEFAULT 0,
					time_pos INTEGER NOT NULL DEFAULT 0, pts INTEGER NOT NULL DEFAULT 0,
					fmb INTEGER NOT NULL DEFAULT 0, fmb_lost INTEGER NOT NULL DEFAULT 0,
					pss_cmp INTEGER NOT NULL DEFAULT 0, pss INTEGER NOT NULL DEFAULT 0,
					pss_yds INTEGER NOT NULL DEFAULT 0, pss_td INTEGER NOT NULL DEFAULT 0,
					pss_int INTEGER NOT NULL DEFAULT 0, pss_lng INTEGER NOT NULL DEFAULT 0,
					pss_sk INTEGER NOT NULL DEFAULT 0, pss_sk_yds INTEGER NOT NULL DEFAULT 0,
					rus INTEGER NOT NULL DEFAULT 0, rus_yds INTEGER NOT NULL DEFAULT 0,
					rus_td INTEGER NOT NULL DEFAULT 0, rus_lng INTEGER NOT NULL DEFAULT 0,
					tgt INTEGER NOT NULL DEFAULT 0, rec INTEGER NOT NULL DEFAULT 0,
					rec_yds INTEGER NOT NULL DEFAULT 0, rec_td INTEGER NOT NULL DEFAULT 0,
					rec_lng INTEGER NOT NULL DEFAULT 0,
					pr INTEGER NOT NULL DEFAULT 0, pr_yds INTEGER NOT NULL DEFAULT 0,
					pr_td INTEGER NOT NULL DEFAULT 0, pr_lng INTEGER NOT NULL DEFAULT 0,
					kr INTEGER NOT NULL DEFAULT 0, kr_yds INTEGER NOT NULL DEFAULT 0,
					kr_td INTEGER NOT NULL DEFAULT 0, kr_lng INTEGER NOT NULL DEFAULT 0,
					def_int INTEGER NOT NULL DEFAULT 0, def_int_yds INTEGER NOT NULL DEFAULT 0,
					def_int_td INTEGER NOT NULL DEFAULT 0, def_int_lng INTEGER NOT NULL DEFAULT 0,
					def_pss_def INTEGER NOT NULL DEFAULT 0,
					def_fmb_frc INTEGER NOT NULL DEFAULT 0, def_fmb_rec INTEGER NOT NULL DEFAULT 0,
					def_fmb_yds INTEGER NOT NULL DEFAULT 0, def_fmb_td INTEGER NOT NULL DEFAULT 0,
					def_fmb_lng INTEGER NOT NULL DEFAULT 0,
					def_sk INTEGER NOT NULL DEFAULT 0, def_tck_solo INTEGER NOT NULL DEFAULT 0,
					def_tck_ast INTEGER NOT NULL DEFAULT 0, def_tck_loss INTEGER NOT NULL DEFAULT 0,
					def_sft INTEGER NOT NULL DEFAULT 0,
					fg0 INTEGER NOT NULL DEFAULT 0, fga0 INTEGER NOT NULL DEFAULT 0,
					fg20 INTEGER NOT NULL DEFAULT 0, fga20 INTEGER NOT NULL DEFAULT 0,
					fg30 INTEGER NOT NULL DEFAULT 0, fga30 INTEGER NOT NULL DEFAULT 0,
					fg40 INTEGER NOT NULL DEFAULT 0, fga40 INTEGER NOT NULL DEFAULT 0,
					fg50 INTEGER NOT NULL DEFAULT 0, fga50 INTEGER NOT NULL DEFAULT 0,
					fg_lng INTEGER NOT NULL DEFAULT 0,
					xp INTEGER NOT NULL DEFAULT 0, xpa INTEGER NOT NULL DEFAULT 0,
					tp INTEGER NOT NULL DEFAULT 0, tpa INTEGER NOT NULL DEFAULT 0,
					ko INTEGER NOT NULL DEFAULT 0, ko_yds INTEGER NOT NULL DEFAULT 0,
					ko_tb INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0,
					ok_rec INTEGER NOT NULL DEFAULT 0,
					pnt INTEGER NOT NULL DEFAULT 0, pnt_yds INTEGER NOT NULL DEFAULT 0,
					pnt_lng INTEGER NOT NULL DEFAULT 0, pnt_tb INTEGER NOT NULL DEFAULT 0,
					pnt_in20 INTEGER NOT NULL DEFAULT 0, pnt_blk INTEGER NOT NULL DEFAULT 0,
					pen INTEGER NOT NULL DEFAULT 0, pen_yds INTEGER NOT NULL DEFAULT 0,
					pbw INTEGER NOT NULL DEFAULT 0, pba INTEGER NOT NULL DEFAULT 0,
					rbw INTEGER NOT NULL DEFAULT 0, rba INTEGER NOT NULL DEFAULT 0,
					sk_alw INTEGER NOT NULL DEFAULT 0,
					opp_drives INTEGER NOT NULL DEFAULT 0, opp_tot_start_yds INTEGER NOT NULL DEFAULT 0,
					opp_time_pos INTEGER NOT NULL DEFAULT 0, opp_pts INTEGER NOT NULL DEFAULT 0,
					opp_fmb INTEGER NOT NULL DEFAULT 0, opp_fmb_lost INTEGER NOT NULL DEFAULT 0,
					opp_pss_cmp INTEGER NOT NULL DEFAULT 0, opp_pss INTEGER NOT NULL DEFAULT 0,
					opp_pss_yds INTEGER NOT NULL DEFAULT 0, opp_pss_td INTEGER NOT NULL DEFAULT 0,
					opp_pss_int INTEGER NOT NULL DEFAULT 0, opp_pss_lng INTEGER NOT NULL DEFAULT 0,
					opp_pss_sk INTEGER NOT NULL DEFAULT 0, opp_pss_sk_yds INTEGER NOT NULL DEFAULT 0,
					opp_rus INTEGER NOT NULL DEFAULT 0, opp_rus_yds INTEGER NOT NULL DEFAULT 0,
					opp_rus_td INTEGER NOT NULL DEFAULT 0, opp_rus_lng INTEGER NOT NULL DEFAULT 0,
					opp_tgt INTEGER NOT NULL DEFAULT 0, opp_rec INTEGER NOT NULL DEFAULT 0,
					opp_rec_yds INTEGER NOT NULL DEFAULT 0, opp_rec_td INTEGER NOT NULL DEFAULT 0,
					opp_rec_lng INTEGER NOT NULL DEFAULT 0,
					opp_pr INTEGER NOT NULL DEFAULT 0, opp_pr_yds INTEGER NOT NULL DEFAULT 0,
					opp_pr_td INTEGER NOT NULL DEFAULT 0, opp_pr_lng INTEGER NOT NULL DEFAULT 0,
					opp_kr INTEGER NOT NULL DEFAULT 0, opp_kr_yds INTEGER NOT NULL DEFAULT 0,
					opp_kr_td INTEGER NOT NULL DEFAULT 0, opp_kr_lng INTEGER NOT NULL DEFAULT 0,
					opp_def_int INTEGER NOT NULL DEFAULT 0, opp_def_int_yds INTEGER NOT NULL DEFAULT 0,
					opp_def_int_td INTEGER NOT NULL DEFAULT 0, opp_def_int_lng INTEGER NOT NULL DEFAULT 0,
					opp_def_pss_def INTEGER NOT NULL DEFAULT 0,
					opp_def_fmb_frc INTEGER NOT NULL DEFAULT 0, opp_def_fmb_rec INTEGER NOT NULL DEFAULT 0,
					opp_def_fmb_yds INTEGER NOT NULL DEFAULT 0, opp_def_fmb_td INTEGER NOT NULL DEFAULT 0,
					opp_def_fmb_lng INTEGER NOT NULL DEFAULT 0,
					opp_def_sk INTEGER NOT NULL DEFAULT 0, opp_def_tck_solo INTEGER NOT NULL DEFAULT 0,
					opp_def_tck_ast INTEGER NOT NULL DEFAULT 0, opp_def_tck_loss INTEGER NOT NULL DEFAULT 0,
					opp_def_sft INTEGER NOT NULL DEFAULT 0,
					opp_fg0 INTEGER NOT NULL DEFAULT 0, opp_fga0 INTEGER NOT NULL DEFAULT 0,
					opp_fg20 INTEGER NOT NULL DEFAULT 0, opp_fga20 INTEGER NOT NULL DEFAULT 0,
					opp_fg30 INTEGER NOT NULL DEFAULT 0, opp_fga30 INTEGER NOT NULL DEFAULT 0,
					opp_fg40 INTEGER NOT NULL DEFAULT 0, opp_fga40 INTEGER NOT NULL DEFAULT 0,
					opp_fg50 INTEGER NOT NULL DEFAULT 0, opp_fga50 INTEGER NOT NULL DEFAULT 0,
					opp_fg_lng INTEGER NOT NULL DEFAULT 0,
					opp_xp INTEGER NOT NULL DEFAULT 0, opp_xpa INTEGER NOT NULL DEFAULT 0,
					opp_tp INTEGER NOT NULL DEFAULT 0, opp_tpa INTEGER NOT NULL DEFAULT 0,
					opp_ko INTEGER NOT NULL DEFAULT 0, opp_ko_yds INTEGER NOT NULL DEFAULT 0,
					opp_ko_tb INTEGER NOT NULL DEFAULT 0, opp_ok INTEGER NOT NULL DEFAULT 0,
					opp_ok_rec INTEGER NOT NULL DEFAULT 0,
					opp_pnt INTEGER NOT NULL DEFAULT 0, opp_pnt_yds INTEGER NOT NULL DEFAULT 0,
					opp_pnt_lng INTEGER NOT NULL DEFAULT 0, opp_pnt_tb INTEGER NOT NULL DEFAULT 0,
					opp_pnt_in20 INTEGER NOT NULL DEFAULT 0, opp_pnt_blk INTEGER NOT NULL DEFAULT 0,
					opp_pen INTEGER NOT NULL DEFAULT 0, opp_pen_yds INTEGER NOT NULL DEFAULT 0,
					opp_pbw INTEGER NOT NULL DEFAULT 0, opp_pba INTEGER NOT NULL DEFAULT 0,
					opp_rbw INTEGER NOT NULL DEFAULT 0, opp_rba INTEGER NOT NULL DEFAULT 0,
					opp_sk_alw INTEGER NOT NULL DEFAULT 0,
					UNIQUE(tid, season, playoffs)
				);
				CREATE INDEX idx_team_stats_season ON team_stats(season);
			`);
			db.prepare("INSERT INTO _migrations (name, run_at) VALUES (?, ?)").run(
				"003_teams",
				new Date().toISOString(),
			);
		})();
	}
	if (!applied.has("004_simple_stores")) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE game_attributes (
					key   TEXT PRIMARY KEY,
					value TEXT NOT NULL
				);

				CREATE TABLE schedule (
					gid       INTEGER PRIMARY KEY,
					away_tid  INTEGER NOT NULL DEFAULT 0,
					home_tid  INTEGER NOT NULL DEFAULT 0,
					day       INTEGER NOT NULL DEFAULT 0,
					force_win TEXT,
					finals    INTEGER
				);

				CREATE TABLE draft_picks (
					dpid         INTEGER PRIMARY KEY,
					tid          INTEGER NOT NULL DEFAULT 0,
					original_tid INTEGER NOT NULL DEFAULT 0,
					round        INTEGER NOT NULL DEFAULT 1,
					pick         INTEGER NOT NULL DEFAULT 0,
					season       TEXT NOT NULL DEFAULT '',
					note         TEXT,
					note_bool    INTEGER
				);
				CREATE INDEX idx_draft_picks_tid ON draft_picks(tid);
				CREATE INDEX idx_draft_picks_season ON draft_picks(season);

				CREATE TABLE negotiations (
					pid       INTEGER PRIMARY KEY,
					tid       INTEGER NOT NULL DEFAULT 0,
					resigning INTEGER NOT NULL DEFAULT 0
				);

				CREATE TABLE released_players (
					rid             INTEGER PRIMARY KEY,
					pid             INTEGER NOT NULL DEFAULT 0,
					tid             INTEGER NOT NULL DEFAULT 0,
					contract_amount REAL NOT NULL DEFAULT 0,
					contract_exp    INTEGER NOT NULL DEFAULT 0
				);
				CREATE INDEX idx_released_players_tid ON released_players(tid);

				CREATE TABLE trade (
					rid   INTEGER PRIMARY KEY,
					teams TEXT NOT NULL DEFAULT '[]'
				);

				CREATE TABLE saved_trades (
					hash TEXT PRIMARY KEY,
					tid  INTEGER NOT NULL DEFAULT 0
				);

				CREATE TABLE saved_trading_block (
					rid         INTEGER PRIMARY KEY,
					dpids       TEXT NOT NULL DEFAULT '[]',
					pids        TEXT NOT NULL DEFAULT '[]',
					tid         INTEGER NOT NULL DEFAULT 0,
					offers      TEXT NOT NULL DEFAULT '[]',
					looking_for TEXT
				);

				CREATE TABLE messages (
					mid         INTEGER PRIMARY KEY,
					sender      TEXT NOT NULL DEFAULT '',
					read        INTEGER NOT NULL DEFAULT 0,
					text        TEXT NOT NULL DEFAULT '',
					year        INTEGER NOT NULL DEFAULT 0,
					tid         INTEGER,
					subject     TEXT,
					owner_moods TEXT
				);
			`);
			db.prepare("INSERT INTO _migrations (name, run_at) VALUES (?, ?)").run(
				"004_simple_stores",
				new Date().toISOString(),
			);
		})();
	}
}

// ---- Phase 5A store serialization helpers ----------------------------------------

function gameAttributeToRow(ga) {
	return { key: ga.key, value: JSON.stringify(ga.value) };
}
function rowToGameAttribute(row) {
	return { key: row.key, value: JSON.parse(row.value) };
}

function scheduleGameToRow(sg) {
	return {
		gid: sg.gid ?? null,
		away_tid: sg.awayTid,
		home_tid: sg.homeTid,
		day: sg.day ?? 0,
		force_win: sg.forceWin !== undefined ? JSON.stringify(sg.forceWin) : null,
		finals: sg.finals !== undefined ? (sg.finals ? 1 : 0) : null,
	};
}
function rowToScheduleGame(row) {
	const sg = {
		gid: row.gid,
		awayTid: row.away_tid,
		homeTid: row.home_tid,
		day: row.day,
	};
	if (row.force_win !== null) sg.forceWin = JSON.parse(row.force_win);
	if (row.finals !== null) sg.finals = row.finals === 1;
	return sg;
}

function draftPickToRow(dp) {
	return {
		dpid: dp.dpid ?? null,
		tid: dp.tid,
		original_tid: dp.originalTid,
		round: dp.round ?? 1,
		pick: dp.pick ?? 0,
		season: String(dp.season),
		note: dp.note ?? null,
		note_bool: dp.noteBool ?? null,
	};
}
function rowToDraftPick(row) {
	const dp = {
		dpid: row.dpid,
		tid: row.tid,
		originalTid: row.original_tid,
		round: row.round,
		pick: row.pick,
		season: /^\d+$/.test(row.season) ? Number(row.season) : row.season,
	};
	if (row.note !== null) dp.note = row.note;
	if (row.note_bool !== null) dp.noteBool = row.note_bool;
	return dp;
}

function negotiationToRow(n) {
	return { pid: n.pid, tid: n.tid, resigning: n.resigning ? 1 : 0 };
}
function rowToNegotiation(row) {
	return { pid: row.pid, tid: row.tid, resigning: row.resigning === 1 };
}

function releasedPlayerToRow(rp) {
	return {
		rid: rp.rid ?? null,
		pid: rp.pid,
		tid: rp.tid,
		contract_amount: rp.contract?.amount ?? 0,
		contract_exp: rp.contract?.exp ?? 0,
	};
}
function rowToReleasedPlayer(row) {
	return {
		rid: row.rid,
		pid: row.pid,
		tid: row.tid,
		contract: { amount: row.contract_amount, exp: row.contract_exp },
	};
}

function tradeToRow(t) {
	return { rid: t.rid, teams: JSON.stringify(t.teams ?? []) };
}
function rowToTrade(row) {
	return { rid: row.rid, teams: JSON.parse(row.teams ?? "[]") };
}

function savedTradeToRow(st) {
	return { hash: st.hash, tid: st.tid };
}
function rowToSavedTrade(row) {
	return { hash: row.hash, tid: row.tid };
}

function savedTradingBlockToRow(stb) {
	return {
		rid: stb.rid,
		dpids: JSON.stringify(stb.dpids ?? []),
		pids: JSON.stringify(stb.pids ?? []),
		tid: stb.tid ?? 0,
		offers: JSON.stringify(stb.offers ?? []),
		looking_for:
			stb.lookingFor !== undefined ? JSON.stringify(stb.lookingFor) : null,
	};
}
function rowToSavedTradingBlock(row) {
	const stb = {
		rid: row.rid,
		dpids: JSON.parse(row.dpids ?? "[]"),
		pids: JSON.parse(row.pids ?? "[]"),
		tid: row.tid,
		offers: JSON.parse(row.offers ?? "[]"),
	};
	if (row.looking_for !== null) stb.lookingFor = JSON.parse(row.looking_for);
	return stb;
}

function messageToRow(m) {
	return {
		mid: m.mid ?? null,
		sender: m.from ?? "",
		read: m.read ? 1 : 0,
		text: m.text ?? "",
		year: m.year ?? 0,
		tid: m.tid ?? null,
		subject: m.subject ?? null,
		owner_moods:
			m.ownerMoods !== undefined ? JSON.stringify(m.ownerMoods) : null,
	};
}
function rowToMessage(row) {
	const m = {
		mid: row.mid,
		from: row.sender,
		read: row.read === 1,
		text: row.text,
		year: row.year,
	};
	if (row.tid !== null) m.tid = row.tid;
	if (row.subject !== null) m.subject = row.subject;
	if (row.owner_moods !== null) m.ownerMoods = JSON.parse(row.owner_moods);
	return m;
}

// ---- Phase 5A export functions ----------------------------------------

export function writeGameAttributes(db, gameAttributes, deleteKeys = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO game_attributes (key, value) VALUES (@key, @value)",
	);
	db.transaction(() => {
		for (const key of deleteKeys) {
			db.prepare("DELETE FROM game_attributes WHERE key = ?").run(key);
		}
		for (const ga of gameAttributes) {
			upsert.run(gameAttributeToRow(ga));
		}
	})();
}
export function readGameAttributes(db) {
	return db
		.prepare("SELECT * FROM game_attributes")
		.all()
		.map(rowToGameAttribute);
}
export function countGameAttributes(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM game_attributes").get()?.n ?? 0;
}

export function writeSchedule(db, scheduleGames, deleteGids = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO schedule (gid, away_tid, home_tid, day, force_win, finals) VALUES (@gid, @away_tid, @home_tid, @day, @force_win, @finals)",
	);
	db.transaction(() => {
		for (const gid of deleteGids) {
			db.prepare("DELETE FROM schedule WHERE gid = ?").run(gid);
		}
		for (const sg of scheduleGames) {
			upsert.run(scheduleGameToRow(sg));
		}
	})();
}
export function readSchedule(db) {
	return db.prepare("SELECT * FROM schedule").all().map(rowToScheduleGame);
}
export function countSchedule(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM schedule").get()?.n ?? 0;
}
export function maxScheduleGid(db) {
	return db.prepare("SELECT MAX(gid) AS m FROM schedule").get()?.m ?? -1;
}

export function writeDraftPicks(db, draftPicks, deleteDpids = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO draft_picks (dpid, tid, original_tid, round, pick, season, note, note_bool) VALUES (@dpid, @tid, @original_tid, @round, @pick, @season, @note, @note_bool)",
	);
	db.transaction(() => {
		for (const dpid of deleteDpids) {
			db.prepare("DELETE FROM draft_picks WHERE dpid = ?").run(dpid);
		}
		for (const dp of draftPicks) {
			upsert.run(draftPickToRow(dp));
		}
	})();
}
export function readDraftPicks(db) {
	return db.prepare("SELECT * FROM draft_picks").all().map(rowToDraftPick);
}
export function countDraftPicks(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM draft_picks").get()?.n ?? 0;
}

export function writeNegotiations(db, negotiations, deletePids = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO negotiations (pid, tid, resigning) VALUES (@pid, @tid, @resigning)",
	);
	db.transaction(() => {
		for (const pid of deletePids) {
			db.prepare("DELETE FROM negotiations WHERE pid = ?").run(pid);
		}
		for (const n of negotiations) {
			upsert.run(negotiationToRow(n));
		}
	})();
}
export function readNegotiations(db) {
	return db.prepare("SELECT * FROM negotiations").all().map(rowToNegotiation);
}
export function countNegotiations(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM negotiations").get()?.n ?? 0;
}

export function writeReleasedPlayers(db, releasedPlayers, deleteRids = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO released_players (rid, pid, tid, contract_amount, contract_exp) VALUES (@rid, @pid, @tid, @contract_amount, @contract_exp)",
	);
	db.transaction(() => {
		for (const rid of deleteRids) {
			db.prepare("DELETE FROM released_players WHERE rid = ?").run(rid);
		}
		for (const rp of releasedPlayers) {
			upsert.run(releasedPlayerToRow(rp));
		}
	})();
}
export function readReleasedPlayers(db) {
	return db
		.prepare("SELECT * FROM released_players")
		.all()
		.map(rowToReleasedPlayer);
}
export function countReleasedPlayers(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM released_players").get()?.n ?? 0;
}

export function writeTrade(db, trades, deleteRids = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO trade (rid, teams) VALUES (@rid, @teams)",
	);
	db.transaction(() => {
		for (const rid of deleteRids) {
			db.prepare("DELETE FROM trade WHERE rid = ?").run(rid);
		}
		for (const t of trades) {
			upsert.run(tradeToRow(t));
		}
	})();
}
export function readTrade(db) {
	return db.prepare("SELECT * FROM trade").all().map(rowToTrade);
}
export function countTrade(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM trade").get()?.n ?? 0;
}

export function writeSavedTrades(db, savedTrades, deleteHashes = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO saved_trades (hash, tid) VALUES (@hash, @tid)",
	);
	db.transaction(() => {
		for (const hash of deleteHashes) {
			db.prepare("DELETE FROM saved_trades WHERE hash = ?").run(hash);
		}
		for (const st of savedTrades) {
			upsert.run(savedTradeToRow(st));
		}
	})();
}
export function readSavedTrades(db) {
	return db.prepare("SELECT * FROM saved_trades").all().map(rowToSavedTrade);
}
export function countSavedTrades(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM saved_trades").get()?.n ?? 0;
}

export function writeSavedTradingBlock(db, blocks, deleteRids = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO saved_trading_block (rid, dpids, pids, tid, offers, looking_for) VALUES (@rid, @dpids, @pids, @tid, @offers, @looking_for)",
	);
	db.transaction(() => {
		for (const rid of deleteRids) {
			db.prepare("DELETE FROM saved_trading_block WHERE rid = ?").run(rid);
		}
		for (const stb of blocks) {
			upsert.run(savedTradingBlockToRow(stb));
		}
	})();
}
export function readSavedTradingBlock(db) {
	return db
		.prepare("SELECT * FROM saved_trading_block")
		.all()
		.map(rowToSavedTradingBlock);
}
export function countSavedTradingBlock(db) {
	return (
		db.prepare("SELECT COUNT(*) AS n FROM saved_trading_block").get()?.n ?? 0
	);
}

export function writeMessages(db, messages, deleteMids = []) {
	const upsert = db.prepare(
		"INSERT OR REPLACE INTO messages (mid, sender, read, text, year, tid, subject, owner_moods) VALUES (@mid, @sender, @read, @text, @year, @tid, @subject, @owner_moods)",
	);
	db.transaction(() => {
		for (const mid of deleteMids) {
			db.prepare("DELETE FROM messages WHERE mid = ?").run(mid);
		}
		for (const m of messages) {
			upsert.run(messageToRow(m));
		}
	})();
}
export function readMessages(db, filter = {}) {
	if (filter.mid !== undefined) {
		const row = db
			.prepare("SELECT * FROM messages WHERE mid = ?")
			.get(filter.mid);
		return row ? [rowToMessage(row)] : [];
	}
	if (filter.limit !== undefined) {
		return db
			.prepare("SELECT * FROM messages ORDER BY mid DESC LIMIT ?")
			.all(filter.limit)
			.map(rowToMessage)
			.reverse();
	}
	return db
		.prepare("SELECT * FROM messages ORDER BY mid")
		.all()
		.map(rowToMessage);
}
export function countMessages(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM messages").get()?.n ?? 0;
}
export function maxMessageMid(db) {
	return db.prepare("SELECT MAX(mid) AS m FROM messages").get()?.m ?? -1;
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

// ---- Team serialization helpers -----------------------------------------

function teamToRow(t) {
	return {
		tid: t.tid,
		cid: t.cid,
		did: t.did,
		region: t.region ?? "",
		name: t.name ?? "",
		abbrev: t.abbrev ?? "",
		img_url: t.imgURL ?? null,
		img_url_small: t.imgURLSmall ?? null,
		jersey: t.jersey ?? null,
		colors: JSON.stringify(t.colors ?? ["#000000", "#ffffff", "#cccccc"]),
		strategy: t.strategy ?? "contending",
		pop: t.pop ?? 0,
		stadium_capacity: t.stadiumCapacity ?? 25000,
		adjust_for_inflation: t.adjustForInflation ? 1 : 0,
		disabled: t.disabled ? 1 : 0,
		keep_roster_sorted: t.keepRosterSorted ? 1 : 0,
		budget_ticket_price: t.budget?.ticketPrice ?? 0,
		budget_scouting: t.budget?.scouting ?? 0,
		budget_coaching: t.budget?.coaching ?? 0,
		budget_health: t.budget?.health ?? 0,
		budget_facilities: t.budget?.facilities ?? 0,
		initial_budget_scouting: t.initialBudget?.scouting ?? 0,
		initial_budget_coaching: t.initialBudget?.coaching ?? 0,
		initial_budget_health: t.initialBudget?.health ?? 0,
		initial_budget_facilities: t.initialBudget?.facilities ?? 0,
		play_through_injuries: JSON.stringify(t.playThroughInjuries ?? [0, 0]),
		depth: t.depth != null ? JSON.stringify(t.depth) : null,
		first_season_after_expansion: t.firstSeasonAfterExpansion ?? null,
		sr_id: t.srID ?? null,
		auto_ticket_price:
			t.autoTicketPrice != null ? (t.autoTicketPrice ? 1 : 0) : null,
		retired_jersey_numbers:
			t.retiredJerseyNumbers != null
				? JSON.stringify(t.retiredJerseyNumbers)
				: null,
		cola: t.cola ?? null,
		cola_opt_out: t.colaOptOut != null ? (t.colaOptOut ? 1 : 0) : null,
	};
}

function rowToTeam(row) {
	const t = {
		tid: row.tid,
		cid: row.cid,
		did: row.did,
		region: row.region,
		name: row.name,
		abbrev: row.abbrev,
		imgURL: row.img_url ?? undefined,
		imgURLSmall: row.img_url_small ?? undefined,
		jersey: row.jersey ?? undefined,
		colors: JSON.parse(row.colors ?? '["#000000","#ffffff","#cccccc"]'),
		strategy: row.strategy,
		pop: row.pop,
		stadiumCapacity: row.stadium_capacity,
		adjustForInflation: row.adjust_for_inflation === 1,
		disabled: row.disabled === 1,
		keepRosterSorted: row.keep_roster_sorted === 1,
		budget: {
			ticketPrice: row.budget_ticket_price,
			scouting: row.budget_scouting,
			coaching: row.budget_coaching,
			health: row.budget_health,
			facilities: row.budget_facilities,
		},
		initialBudget: {
			scouting: row.initial_budget_scouting,
			coaching: row.initial_budget_coaching,
			health: row.initial_budget_health,
			facilities: row.initial_budget_facilities,
		},
		playThroughInjuries: JSON.parse(row.play_through_injuries ?? "[0,0]"),
		depth: row.depth != null ? JSON.parse(row.depth) : undefined,
		firstSeasonAfterExpansion: row.first_season_after_expansion ?? undefined,
		srID: row.sr_id ?? undefined,
		autoTicketPrice:
			row.auto_ticket_price != null ? row.auto_ticket_price === 1 : undefined,
		retiredJerseyNumbers:
			row.retired_jersey_numbers != null
				? JSON.parse(row.retired_jersey_numbers)
				: undefined,
		cola: row.cola ?? undefined,
		colaOptOut: row.cola_opt_out != null ? row.cola_opt_out === 1 : undefined,
	};
	for (const k of Object.keys(t)) {
		if (t[k] === undefined) delete t[k];
	}
	return t;
}

function teamSeasonToRow(ts) {
	return {
		rid: ts.rid ?? null,
		tid: ts.tid,
		season: ts.season,
		gp_home: ts.gpHome ?? 0,
		att: ts.att ?? 0,
		cash: ts.cash ?? 0,
		won: ts.won ?? 0,
		lost: ts.lost ?? 0,
		tied: ts.tied ?? 0,
		otl: ts.otl ?? 0,
		won_home: ts.wonHome ?? 0,
		lost_home: ts.lostHome ?? 0,
		tied_home: ts.tiedHome ?? 0,
		otl_home: ts.otlHome ?? 0,
		won_away: ts.wonAway ?? 0,
		lost_away: ts.lostAway ?? 0,
		tied_away: ts.tiedAway ?? 0,
		otl_away: ts.otlAway ?? 0,
		won_div: ts.wonDiv ?? 0,
		lost_div: ts.lostDiv ?? 0,
		tied_div: ts.tiedDiv ?? 0,
		otl_div: ts.otlDiv ?? 0,
		won_conf: ts.wonConf ?? 0,
		lost_conf: ts.lostConf ?? 0,
		tied_conf: ts.tiedConf ?? 0,
		otl_conf: ts.otlConf ?? 0,
		last_ten: JSON.stringify(ts.lastTen ?? []),
		streak: ts.streak ?? 0,
		playoff_rounds_won: ts.playoffRoundsWon ?? -1,
		hype: ts.hype ?? 0.5,
		pop: ts.pop ?? 0,
		stadium_capacity: ts.stadiumCapacity ?? 0,
		payroll_end_of_season: ts.payrollEndOfSeason ?? 0,
		num_players_traded_away: ts.numPlayersTradedAway ?? 0,
		note: ts.note ?? null,
		note_bool: ts.noteBool ?? null,
		clinched_playoffs: ts.clinchedPlayoffs ?? null,
		avg_age: ts.avgAge ?? null,
		ovr_start: ts.ovrStart ?? null,
		ovr_end: ts.ovrEnd ?? null,
		rev_luxury_tax_share: ts.revenues?.luxuryTaxShare ?? 0,
		rev_merch: ts.revenues?.merch ?? 0,
		rev_sponsor: ts.revenues?.sponsor ?? 0,
		rev_ticket: ts.revenues?.ticket ?? 0,
		rev_national_tv: ts.revenues?.nationalTv ?? 0,
		rev_local_tv: ts.revenues?.localTv ?? 0,
		exp_luxury_tax: ts.expenses?.luxuryTax ?? 0,
		exp_min_tax: ts.expenses?.minTax ?? 0,
		exp_salary: ts.expenses?.salary ?? 0,
		exp_coaching: ts.expenses?.coaching ?? 0,
		exp_health: ts.expenses?.health ?? 0,
		exp_facilities: ts.expenses?.facilities ?? 0,
		exp_scouting: ts.expenses?.scouting ?? 0,
		exp_level_coaching: ts.expenseLevels?.coaching ?? 0,
		exp_level_facilities: ts.expenseLevels?.facilities ?? 0,
		exp_level_health: ts.expenseLevels?.health ?? 0,
		exp_level_scouting: ts.expenseLevels?.scouting ?? 0,
		owner_mood_money: ts.ownerMood?.money ?? null,
		owner_mood_playoffs: ts.ownerMood?.playoffs ?? null,
		owner_mood_wins: ts.ownerMood?.wins ?? null,
		cid: ts.cid ?? 0,
		did: ts.did ?? 0,
		region: ts.region ?? "",
		name: ts.name ?? "",
		abbrev: ts.abbrev ?? "",
		img_url: ts.imgURL ?? null,
		img_url_small: ts.imgURLSmall ?? null,
		jersey: ts.jersey ?? null,
		colors: JSON.stringify(ts.colors ?? ["#000000", "#ffffff", "#cccccc"]),
		sr_id: ts.srID ?? null,
	};
}

function rowToTeamSeason(row) {
	return {
		rid: row.rid,
		tid: row.tid,
		season: row.season,
		gpHome: row.gp_home,
		att: row.att,
		cash: row.cash,
		won: row.won,
		lost: row.lost,
		tied: row.tied,
		otl: row.otl,
		wonHome: row.won_home,
		lostHome: row.lost_home,
		tiedHome: row.tied_home,
		otlHome: row.otl_home,
		wonAway: row.won_away,
		lostAway: row.lost_away,
		tiedAway: row.tied_away,
		otlAway: row.otl_away,
		wonDiv: row.won_div,
		lostDiv: row.lost_div,
		tiedDiv: row.tied_div,
		otlDiv: row.otl_div,
		wonConf: row.won_conf,
		lostConf: row.lost_conf,
		tiedConf: row.tied_conf,
		otlConf: row.otl_conf,
		lastTen: JSON.parse(row.last_ten ?? "[]"),
		streak: row.streak,
		playoffRoundsWon: row.playoff_rounds_won,
		hype: row.hype,
		pop: row.pop,
		stadiumCapacity: row.stadium_capacity,
		payrollEndOfSeason: row.payroll_end_of_season,
		numPlayersTradedAway: row.num_players_traded_away,
		note: row.note ?? undefined,
		noteBool: row.note_bool ?? undefined,
		clinchedPlayoffs: row.clinched_playoffs ?? undefined,
		avgAge: row.avg_age ?? undefined,
		ovrStart: row.ovr_start ?? undefined,
		ovrEnd: row.ovr_end ?? undefined,
		revenues: {
			luxuryTaxShare: row.rev_luxury_tax_share,
			merch: row.rev_merch,
			sponsor: row.rev_sponsor,
			ticket: row.rev_ticket,
			nationalTv: row.rev_national_tv,
			localTv: row.rev_local_tv,
		},
		expenses: {
			luxuryTax: row.exp_luxury_tax,
			minTax: row.exp_min_tax,
			salary: row.exp_salary,
			coaching: row.exp_coaching,
			health: row.exp_health,
			facilities: row.exp_facilities,
			scouting: row.exp_scouting,
		},
		expenseLevels: {
			coaching: row.exp_level_coaching,
			facilities: row.exp_level_facilities,
			health: row.exp_level_health,
			scouting: row.exp_level_scouting,
		},
		ownerMood:
			row.owner_mood_money != null
				? {
						money: row.owner_mood_money,
						playoffs: row.owner_mood_playoffs,
						wins: row.owner_mood_wins,
					}
				: undefined,
		cid: row.cid,
		did: row.did,
		region: row.region,
		name: row.name,
		abbrev: row.abbrev,
		imgURL: row.img_url ?? undefined,
		imgURLSmall: row.img_url_small ?? undefined,
		jersey: row.jersey ?? undefined,
		colors: JSON.parse(row.colors ?? '["#000000","#ffffff","#cccccc"]'),
		srID: row.sr_id ?? undefined,
	};
}

function teamStatsToRow(ts) {
	const row = {
		rid: ts.rid ?? null,
		tid: ts.tid,
		season: ts.season,
		playoffs: ts.playoffs ? 1 : 0,
	};
	for (let i = 0; i < TEAM_STATS_KEYS.length; i++) {
		row[TEAM_STATS_COLS[i]] = ts[TEAM_STATS_KEYS[i]] ?? 0;
	}
	return row;
}

function rowToTeamStats(row) {
	const ts = {
		rid: row.rid,
		tid: row.tid,
		season: row.season,
		playoffs: row.playoffs === 1,
	};
	for (let i = 0; i < TEAM_STATS_KEYS.length; i++) {
		ts[TEAM_STATS_KEYS[i]] = row[TEAM_STATS_COLS[i]] ?? 0;
	}
	return ts;
}

export function writeTeams(db, teams, deleteTids = []) {
	const upsert = db.prepare(
		`INSERT OR REPLACE INTO teams (${TEAM_TABLE_COLS.join(", ")}) VALUES (${TEAM_TABLE_COLS.map((c) => "@" + c).join(", ")})`,
	);
	db.transaction(() => {
		for (const tid of deleteTids) {
			db.prepare("DELETE FROM teams WHERE tid = ?").run(tid);
		}
		for (const t of teams) {
			upsert.run(teamToRow(t));
		}
	})();
}

export function readAllTeams(db) {
	return db.prepare("SELECT * FROM teams").all().map(rowToTeam);
}

export function countTeams(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM teams").get()?.n ?? 0;
}

export function writeTeamSeasons(db, teamSeasons, deleteRids = []) {
	const upsert = db.prepare(
		`INSERT OR REPLACE INTO team_seasons (${TS_FIXED_COLS.join(", ")}) VALUES (${TS_FIXED_COLS.map((c) => "@" + c).join(", ")})`,
	);
	db.transaction(() => {
		for (const rid of deleteRids) {
			db.prepare("DELETE FROM team_seasons WHERE rid = ?").run(rid);
		}
		for (const ts of teamSeasons) {
			upsert.run(teamSeasonToRow(ts));
		}
	})();
}

export function readTeamSeasons(db, filter = {}) {
	let rows;
	if (filter.note) {
		rows = db
			.prepare("SELECT * FROM team_seasons WHERE note_bool IS NOT NULL")
			.all();
	} else if (filter.tid !== undefined && filter.season !== undefined) {
		rows = db
			.prepare("SELECT * FROM team_seasons WHERE tid = ? AND season = ?")
			.all(filter.tid, filter.season);
	} else if (filter.season !== undefined) {
		rows = db
			.prepare("SELECT * FROM team_seasons WHERE season = ?")
			.all(filter.season);
	} else if (filter.tid !== undefined && filter.seasonFrom !== undefined) {
		rows = db
			.prepare(
				"SELECT * FROM team_seasons WHERE tid = ? AND season >= ? AND season <= ?",
			)
			.all(filter.tid, filter.seasonFrom, filter.seasonTo ?? 9999);
	} else if (filter.tid !== undefined) {
		rows = db
			.prepare("SELECT * FROM team_seasons WHERE tid = ?")
			.all(filter.tid);
	} else if (filter.seasonFrom !== undefined) {
		rows = db
			.prepare("SELECT * FROM team_seasons WHERE season >= ?")
			.all(filter.seasonFrom);
	} else {
		rows = db.prepare("SELECT * FROM team_seasons").all();
	}
	return rows.map(rowToTeamSeason);
}

export function countTeamSeasons(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM team_seasons").get()?.n ?? 0;
}

export function writeTeamStats(db, teamStats, deleteRids = []) {
	const upsert = db.prepare(
		`INSERT OR REPLACE INTO team_stats (${TST_ALL_COLS.join(", ")}) VALUES (${TST_ALL_COLS.map((c) => "@" + c).join(", ")})`,
	);
	db.transaction(() => {
		for (const rid of deleteRids) {
			db.prepare("DELETE FROM team_stats WHERE rid = ?").run(rid);
		}
		for (const ts of teamStats) {
			upsert.run(teamStatsToRow(ts));
		}
	})();
}

export function readTeamStats(db, filter = {}) {
	let rows;
	if (filter.season !== undefined && filter.tid !== undefined) {
		rows = db
			.prepare("SELECT * FROM team_stats WHERE season = ? AND tid = ?")
			.all(filter.season, filter.tid);
	} else if (filter.season !== undefined) {
		rows = db
			.prepare("SELECT * FROM team_stats WHERE season = ?")
			.all(filter.season);
	} else if (filter.tid !== undefined) {
		rows = db.prepare("SELECT * FROM team_stats WHERE tid = ?").all(filter.tid);
	} else {
		rows = db.prepare("SELECT * FROM team_stats").all();
	}
	return rows.map(rowToTeamStats);
}

export function countTeamStats(db) {
	return db.prepare("SELECT COUNT(*) AS n FROM team_stats").get()?.n ?? 0;
}

// ---- End team helpers ----------------------------------------------------

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
