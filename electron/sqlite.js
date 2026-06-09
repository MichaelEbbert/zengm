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
}

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
