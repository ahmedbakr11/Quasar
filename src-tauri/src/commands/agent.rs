use std::time::Duration as StdDuration;

use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use livekit_api::access_token::VideoGrants;
use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{connection, AppState};
use crate::models::user::UserProfile;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct AgentConfig {
    pub livekit_url: String,
    pub livekit_api_key: String,
    pub room_name: String,
    pub agent_name: String,
    pub is_configured: bool,
}

#[derive(serde::Deserialize)]
pub struct SaveAgentConfigPayload {
    pub livekit_url: String,
    pub livekit_api_key: String,
    pub livekit_api_secret: String,
    pub room_name: String,
    pub agent_name: String,
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

fn load_agent_row(conn: &Connection) -> Result<(String, String, String, String, String), String> {
    conn.query_row(
        "SELECT livekit_url, livekit_api_key, livekit_api_secret, room_name, agent_name FROM agent_config WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )
    .map_err(|e| format!("Failed to load agent config: {e}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SipGrants {
    admin: bool,
    call: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomAgentDispatch {
    agent_name: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomConfiguration {
    name: String,
    agents: Vec<RoomAgentDispatch>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveKitClaims {
    exp: usize,
    iss: String,
    nbf: usize,
    sub: String,
    name: String,
    video: VideoGrants,
    sip: SipGrants,
    sha256: String,
    metadata: String,
    room_config: RoomConfiguration,
}

fn generate_token(
    identity: &str,
    room_name: &str,
    agent_name: &str,
    api_key: &str,
    api_secret: &str,
) -> Result<String, String> {
    let grants = VideoGrants {
        room_join: true,
        room: room_name.to_string(),
        can_publish: true,
        can_subscribe: true,
        ..Default::default()
    };

    let now = Utc::now().timestamp() as usize;
    let exp = now + StdDuration::from_secs(3600).as_secs() as usize;

    let claims = LiveKitClaims {
        exp,
        iss: api_key.to_string(),
        nbf: now,
        sub: identity.to_string(),
        name: identity.to_string(),
        video: grants,
        sip: SipGrants {
            admin: false,
            call: false,
        },
        sha256: String::new(),
        metadata: String::new(),
        room_config: RoomConfiguration {
            name: room_name.to_string(),
            agents: vec![RoomAgentDispatch {
                agent_name: agent_name.to_string(),
            }],
        },
    };

    encode(
        &Header::new(jsonwebtoken::Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(api_secret.as_bytes()),
    )
    .map_err(|e| format!("Token generation failed: {e}"))
}

#[tauri::command]
pub fn save_agent_config(
    state: State<AppState>,
    session_token: String,
    payload: SaveAgentConfigPayload,
) -> Result<(), String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;

    conn.execute(
        "INSERT INTO agent_config (id, livekit_url, livekit_api_key, livekit_api_secret, room_name, agent_name)
         VALUES (1, ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
           livekit_url = excluded.livekit_url,
           livekit_api_key = excluded.livekit_api_key,
           livekit_api_secret = excluded.livekit_api_secret,
           room_name = excluded.room_name,
           agent_name = excluded.agent_name",
        params![
            payload.livekit_url.trim(),
            payload.livekit_api_key.trim(),
            payload.livekit_api_secret.trim(),
            payload.room_name.trim(),
            payload.agent_name.trim()
        ],
    )
    .map_err(|e| format!("Failed to save agent config: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn load_agent_config(state: State<AppState>, session_token: String) -> Result<AgentConfig, String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;

    let (livekit_url, livekit_api_key, livekit_api_secret, room_name, agent_name) = load_agent_row(&conn)?;
    let is_configured = !livekit_url.trim().is_empty()
        && !livekit_api_key.trim().is_empty()
        && !livekit_api_secret.trim().is_empty();

    Ok(AgentConfig {
        livekit_url,
        livekit_api_key,
        room_name,
        agent_name,
        is_configured,
    })
}

#[tauri::command]
pub fn generate_livekit_token(state: State<AppState>, session_token: String) -> Result<String, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    let user = find_user_by_id(&conn, &user_id)?;
    let (livekit_url, livekit_api_key, livekit_api_secret, room_name, agent_name) = load_agent_row(&conn)?;

    if livekit_url.trim().is_empty() || livekit_api_key.trim().is_empty() || livekit_api_secret.trim().is_empty()
    {
        return Err("Agent not configured".to_string());
    }
    if room_name.trim().is_empty() {
        return Err("Room name is required".to_string());
    }
    if agent_name.trim().is_empty() {
        return Err("Agent name is required".to_string());
    }

    generate_token(
        &user.username,
        &room_name,
        &agent_name,
        livekit_api_key.trim(),
        livekit_api_secret.trim(),
    )
}

#[tauri::command]
pub fn test_agent_connection(state: State<AppState>, session_token: String) -> Result<String, String> {
    let conn = connection(&state)?;
    let user_id = validate_session(&conn, &session_token)?;
    let user = find_user_by_id(&conn, &user_id)?;
    let (livekit_url, livekit_api_key, livekit_api_secret, room_name, agent_name) = load_agent_row(&conn)?;

    if livekit_url.trim().is_empty() || livekit_api_key.trim().is_empty() || livekit_api_secret.trim().is_empty()
    {
        return Err("Agent not configured".to_string());
    }
    if room_name.trim().is_empty() {
        return Err("Room name is required".to_string());
    }
    if agent_name.trim().is_empty() {
        return Err("Agent name is required".to_string());
    }

    generate_token(
        &user.username,
        &room_name,
        &agent_name,
        livekit_api_key.trim(),
        livekit_api_secret.trim(),
    )?;
    Ok("Token generated successfully".to_string())
}
