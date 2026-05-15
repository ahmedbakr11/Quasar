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

        CREATE TABLE IF NOT EXISTS task_lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          name TEXT NOT NULL,
          color_token TEXT NOT NULL DEFAULT 'slate',
          position INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, status)
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          due_date TEXT NOT NULL,
          priority TEXT NOT NULL,
          status TEXT NOT NULL,
          color_token TEXT NOT NULL DEFAULT 'slate',
          position INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_subtasks (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          text TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL DEFAULT 0
        );
        ",
    )
    .map_err(|e| format!("Migration error: {e}"))
}
