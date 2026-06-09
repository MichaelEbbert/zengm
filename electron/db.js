import Database from "better-sqlite3";

import { migrations } from "./migrations/index.js";

let _db = null;

// Opens the database at dbPath and runs any pending migrations.
// Pass ':memory:' in tests. Call once at app startup.
export function initDb(dbPath) {
	if (_db) return _db;

	_db = new Database(dbPath);
	_db.pragma("journal_mode = WAL");
	_db.pragma("foreign_keys = ON");

	_db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL UNIQUE,
      run_at TEXT NOT NULL
    )
  `);

	const applied = new Set(
		_db
			.prepare("SELECT name FROM _migrations")
			.all()
			.map((r) => r.name),
	);

	for (const { name, up } of migrations) {
		if (!applied.has(name)) {
			_db.transaction(() => {
				up(_db);
				_db
					.prepare("INSERT INTO _migrations (name, run_at) VALUES (?, ?)")
					.run(name, new Date().toISOString());
			})();
			console.log(`[DB] Applied migration: ${name}`);
		}
	}

	return _db;
}

export function getDb() {
	if (!_db) throw new Error("DB not initialized — call initDb() first");
	return _db;
}
