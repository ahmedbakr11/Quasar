use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::db::{connection, AppState};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteItem {
    pub id: String,
    pub title: String,
    pub body: String,
    pub labels: Vec<String>,
    pub color_token: String,
    pub pinned: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotePayload {
    pub title: String,
    pub body: String,
    pub labels: Vec<String>,
    pub color_token: String,
    pub pinned: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotePayload {
    pub title: Option<String>,
    pub body: Option<String>,
    pub labels: Option<Vec<String>>,
    pub color_token: Option<String>,
    pub pinned: Option<bool>,
    pub archived: Option<bool>,
}

fn validate_session(conn: &Connection, token: &str) -> Result<String, String> {
    let now = Utc::now().to_rfc3339();
    conn.query_row(
        "SELECT user_id FROM sessions WHERE id = ?1 AND expires_at > ?2",
        params![token, now],
        |row| row.get(0),
    )
    .map_err(|_| "Invalid or expired session".to_string())
}

fn clean_labels(labels: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for label in labels {
        let cleaned = label.trim().trim_start_matches('#').to_string();
        if !cleaned.is_empty() && !out.iter().any(|item| item == &cleaned) {
            out.push(cleaned);
        }
    }
    out
}

fn labels_to_json(labels: &[String]) -> Result<String, String> {
    serde_json::to_string(&clean_labels(labels)).map_err(|e| format!("Failed to serialize note labels: {e}"))
}

fn parse_labels(raw: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteItem> {
    let labels_raw: String = row.get(2)?;
    let pinned: i64 = row.get(4)?;
    let archived: i64 = row.get(5)?;
    Ok(NoteItem {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(3)?,
        labels: parse_labels(labels_raw),
        color_token: row.get(6)?,
        pinned: pinned == 1,
        archived: archived == 1,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn load_note(conn: &Connection, user_id: &str, note_id: &str) -> Result<NoteItem, String> {
    conn.query_row(
        "SELECT id, title, labels, body, pinned, archived, color_token, created_at, updated_at
         FROM notes
         WHERE id = ?1 AND user_id = ?2",
        params![note_id, user_id],
        row_to_note,
    )
    .map_err(|_| "Note not found".to_string())
}

#[tauri::command]
pub fn list_notes(state: State<AppState>, session_token: String) -> Result<Vec<NoteItem>, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, labels, body, pinned, archived, color_token, created_at, updated_at
             FROM notes
             WHERE user_id = ?1 AND archived = 0
             ORDER BY pinned DESC, updated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare notes query: {e}"))?;
    let notes = stmt.query_map(params![user_id], row_to_note)
        .map_err(|e| format!("Failed to query notes: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to parse notes: {e}"))?;
    Ok(notes)
}

#[tauri::command]
pub fn create_note(
    state: State<AppState>,
    session_token: String,
    payload: CreateNotePayload,
) -> Result<NoteItem, String> {
    let title = payload.title.trim();
    let body = payload.body.trim();
    if title.is_empty() && body.is_empty() {
        return Err("Note title or body is required".to_string());
    }

    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    let now = Utc::now().to_rfc3339();
    let note_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO notes (id, user_id, title, body, labels, color_token, pinned, archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?8)",
        params![
            note_id,
            user_id,
            title,
            body,
            labels_to_json(&payload.labels)?,
            payload.color_token.trim(),
            if payload.pinned { 1_i64 } else { 0_i64 },
            now
        ],
    )
    .map_err(|e| format!("Failed to create note: {e}"))?;
    load_note(&conn, &validate_session(&conn, &session_token)?, &note_id)
}

#[tauri::command]
pub fn update_note(
    state: State<AppState>,
    session_token: String,
    note_id: String,
    patch: UpdateNotePayload,
) -> Result<NoteItem, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    let existing = conn
        .query_row(
            "SELECT title, body, labels, color_token, pinned, archived FROM notes WHERE id = ?1 AND user_id = ?2",
            params![&note_id, &user_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Failed to load note: {e}"))?
        .ok_or_else(|| "Note not found".to_string())?;

    let labels = patch
        .labels
        .map(|value| labels_to_json(&value))
        .transpose()?
        .unwrap_or(existing.2);
    conn.execute(
        "UPDATE notes
         SET title = ?1, body = ?2, labels = ?3, color_token = ?4, pinned = ?5, archived = ?6, updated_at = ?7
         WHERE id = ?8 AND user_id = ?9",
        params![
            patch.title.unwrap_or(existing.0).trim(),
            patch.body.unwrap_or(existing.1).trim(),
            labels,
            patch.color_token.unwrap_or(existing.3).trim(),
            patch.pinned.map(|value| if value { 1_i64 } else { 0_i64 }).unwrap_or(existing.4),
            patch.archived.map(|value| if value { 1_i64 } else { 0_i64 }).unwrap_or(existing.5),
            Utc::now().to_rfc3339(),
            &note_id,
            &user_id
        ],
    )
    .map_err(|e| format!("Failed to update note: {e}"))?;
    load_note(&conn, &user_id, &note_id)
}

#[tauri::command]
pub fn delete_note(state: State<AppState>, session_token: String, note_id: String) -> Result<(), String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    let deleted = conn
        .execute(
            "DELETE FROM notes WHERE id = ?1 AND user_id = ?2",
            params![note_id, user_id],
        )
        .map_err(|e| format!("Failed to delete note: {e}"))?;
    if deleted == 0 {
        return Err("Note not found".to_string());
    }
    Ok(())
}
