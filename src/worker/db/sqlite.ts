// Per-league SQLite connections for the worker process.
// Returns null in browser and test environments where ZENGM_DB_DIR is not set.
// Each league gets its own file: <dbDir>/league-<lid>.db

import { g } from "../util/index.ts";

const _dbs = new Map<number, any>();

function runMigrations(db: any): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL UNIQUE,
      run_at TEXT NOT NULL
    )
  `);

	const applied = new Set<string>(
		(db.prepare("SELECT name FROM _migrations").all() as any[]).map(
			(r) => r.name,
		),
	);

	if (!applied.has("001_box_scores")) {
		(
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
			}) as any
		)();
	}
}

export async function getSqliteDb(): Promise<any> {
	// Use bracket notation so the bundler doesn't substitute this at build time
	const dbDir =
		typeof process !== "undefined"
			? (process as any).env?.["ZENGM_DB_DIR"]
			: undefined;

	if (!dbDir) return null;

	let lid: number | undefined;
	try {
		lid = g.get("lid") as number | undefined;
	} catch {
		return null;
	}
	if (typeof lid !== "number") return null;

	if (_dbs.has(lid)) return _dbs.get(lid);

	try {
		const { default: Database } = await import("better-sqlite3");
		const { mkdirSync } = await import("fs");
		const { join } = await import("path");

		mkdirSync(dbDir, { recursive: true });
		const dbPath = join(dbDir, `league-${lid}.db`);
		const db = new Database(dbPath);
		db.pragma("journal_mode = WAL");
		db.pragma("foreign_keys = ON");
		runMigrations(db);
		_dbs.set(lid, db);
		return db;
	} catch (e) {
		console.warn("[SQLite] Worker could not open database:", e);
		return null;
	}
}
