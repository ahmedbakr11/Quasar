use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT,
          avatar_seed TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_config (
          id INTEGER PRIMARY KEY,
          livekit_url TEXT NOT NULL DEFAULT '',
          livekit_api_key TEXT NOT NULL DEFAULT '',
          livekit_api_secret TEXT NOT NULL DEFAULT '',
          room_name TEXT NOT NULL DEFAULT 'luna-room',
          agent_name TEXT NOT NULL DEFAULT 'gemini_voice_agent'
        );
        INSERT OR IGNORE INTO agent_config (id) VALUES (1);
        ",
    )
    .map_err(|e| format!("Migration error: {e}"))
}
