// Lazy singleton SQLite connection for the worker process.
// Returns null in browser and test environments where ZENGM_DB_PATH is not set.

let _db: any | null | undefined = undefined; // undefined = not yet attempted

export async function getSqliteDb(): Promise<any> {
	if (_db !== undefined) return _db;

	// Use bracket notation so the bundler doesn't substitute this at build time
	const dbPath =
		typeof process !== "undefined"
			? (process as any).env?.["ZENGM_DB_PATH"]
			: undefined;

	if (!dbPath) {
		_db = null;
		return null;
	}

	try {
		const { default: Database } = await import("better-sqlite3");
		_db = new Database(dbPath);
		_db.pragma("journal_mode = WAL");
		_db.pragma("foreign_keys = ON");
	} catch (e) {
		console.warn("[SQLite] Worker could not open database:", e);
		_db = null;
	}

	return _db;
}
