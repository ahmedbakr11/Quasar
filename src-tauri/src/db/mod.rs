pub mod migrations;

use std::path::PathBuf;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

#[derive(Clone)]
pub struct AppState {
    pub db_path: PathBuf,
}

pub fn init_db(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    std::fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;

    let db_path = app_data_dir.join("luna.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open DB: {e}"))?;
    migrations::run_migrations(&conn)?;
    Ok(db_path)
}

pub fn connection(state: &State<AppState>) -> Result<Connection, String> {
    Connection::open(&state.db_path).map_err(|e| format!("Failed to open DB connection: {e}"))
}
