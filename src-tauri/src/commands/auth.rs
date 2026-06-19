use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::commands::runtime::RuntimeManager;
use crate::db::{connection, AppState};
use crate::models::user::{SessionToken, UserProfile};

fn find_user_by_id(conn: &Connection, user_id: &str) -> Result<UserProfile, String> {
    conn.query_row(
        "SELECT id, username, email, display_name, avatar_seed, created_at FROM users WHERE id = ?1",
        params![user_id],
        |row| {
            Ok(UserProfile {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                display_name: row.get(3)?,
                avatar_seed: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )
    .map_err(|_| "User not found".to_string())
}

fn validate_session(conn: &Connection, token: &str) -> Result<String, String> {
    let now = Utc::now().to_rfc3339();
    let user_id: String = conn
        .query_row(
            "SELECT user_id FROM sessions WHERE id = ?1 AND expires_at > ?2",
            params![token, now],
            |row| row.get(0),
        )
        .map_err(|_| "Invalid or expired session".to_string())?;
    Ok(user_id)
}

fn create_session(conn: &Connection, user_id: &str) -> Result<SessionToken, String> {
    let token = Uuid::new_v4().to_string();
    let created_at = Utc::now();
    let expires_at = created_at + Duration::days(30);

    conn.execute(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            token,
            user_id,
            created_at.to_rfc3339(),
            expires_at.to_rfc3339()
        ],
    )
    .map_err(|e| format!("Failed to create session: {e}"))?;

    let user = find_user_by_id(conn, user_id)?;
    Ok(SessionToken { token, user })
}

fn user_count(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| format!("Failed to inspect onboarding state: {e}"))
}

fn derive_username(name: &str, email: &str) -> String {
    let source = email.split('@').next().filter(|s| !s.trim().is_empty()).unwrap_or(name);
    let mut username = source
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
        .collect::<String>()
        .to_lowercase();
    if username.len() < 3 {
        username = "user".to_string();
    }
    username
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingStatus {
    pub is_first_launch: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOnboardingPayload {
    pub voice: String,
    pub persona: String,
    pub google_api_key: String,
    pub name: String,
    pub email: String,
    pub password: String,
}

#[tauri::command]
pub fn get_onboarding_status(state: State<AppState>) -> Result<OnboardingStatus, String> {
    let conn = connection(&state)?;
    Ok(OnboardingStatus {
        is_first_launch: user_count(&conn)? == 0,
    })
}

#[tauri::command]
pub fn complete_onboarding(
    app: AppHandle,
    state: State<AppState>,
    runtime: State<RuntimeManager>,
    payload: CompleteOnboardingPayload,
) -> Result<SessionToken, String> {
    let conn = connection(&state)?;
    if user_count(&conn)? > 0 {
        return Err("Onboarding has already been completed".to_string());
    }

    let name = payload.name.trim();
    let email = payload.email.trim().to_lowercase();
    if name.is_empty() {
        return Err("Name is required".to_string());
    }
    if !email.contains('@') {
        return Err("A valid email is required".to_string());
    }
    if payload.password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }

    runtime.save_luna_onboarding_env(
        &app,
        &payload.voice,
        &payload.persona,
        &payload.google_api_key,
    )?;

    let user_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let avatar_seed = Uuid::new_v4().to_string();
    let password_hash = hash(payload.password, 12.max(DEFAULT_COST)).map_err(|e| format!("Hashing failed: {e}"))?;
    let username = derive_username(name, &email);

    conn.execute(
        "INSERT INTO users (id, username, email, password_hash, display_name, avatar_seed, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            user_id,
            username,
            email,
            password_hash,
            name,
            avatar_seed,
            created_at
        ],
    )
    .map_err(|e| format!("Failed to create user: {e}"))?;

    create_session(&conn, &user_id)
}

#[tauri::command]
pub fn register_user(
    state: State<AppState>,
    username: String,
    email: String,
    password: String,
    display_name: Option<String>,
) -> Result<UserProfile, String> {
    if username.len() < 3 {
        return Err("Username must be at least 3 characters".into());
    }
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".into());
    }

    let conn = connection(&state)?;
    let user_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let avatar_seed = Uuid::new_v4().to_string();
    let password_hash = hash(password, 12.max(DEFAULT_COST)).map_err(|e| format!("Hashing failed: {e}"))?;

    conn.execute(
        "INSERT INTO users (id, username, email, password_hash, display_name, avatar_seed, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            user_id,
            username.trim().to_lowercase(),
            email.trim().to_lowercase(),
            password_hash,
            display_name,
            avatar_seed,
            created_at
        ],
    )
    .map_err(|e| format!("Failed to create user: {e}"))?;

    find_user_by_id(&conn, &user_id)
}

#[tauri::command]
pub fn login(state: State<AppState>, email: String, password: String) -> Result<SessionToken, String> {
    let conn = connection(&state)?;
    let mut stmt = conn
        .prepare("SELECT id, password_hash FROM users WHERE email = ?1")
        .map_err(|e| format!("Query failed: {e}"))?;

    let (user_id, password_hash): (String, String) = stmt
        .query_row(params![email.trim().to_lowercase()], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Invalid credentials".to_string())?;

    let is_valid = verify(password, &password_hash).map_err(|_| "Invalid credentials".to_string())?;
    if !is_valid {
        return Err("Invalid credentials".into());
    }

    create_session(&conn, &user_id)
}

#[tauri::command]
pub fn logout(state: State<AppState>, session_token: String) -> Result<(), String> {
    let conn = connection(&state)?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_token])
        .map_err(|e| format!("Logout failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_current_user(state: State<AppState>, session_token: String) -> Result<UserProfile, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    find_user_by_id(&conn, &user_id)
}

#[tauri::command]
pub fn update_profile(
    state: State<AppState>,
    session_token: String,
    display_name: String,
    avatar_seed: String,
) -> Result<UserProfile, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;

    conn.execute(
        "UPDATE users SET display_name = ?1, avatar_seed = ?2 WHERE id = ?3",
        params![display_name, avatar_seed, user_id],
    )
    .map_err(|e| format!("Profile update failed: {e}"))?;

    find_user_by_id(&conn, &user_id)
}
