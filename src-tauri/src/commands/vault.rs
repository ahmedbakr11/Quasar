use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::State;
use uuid::Uuid;

use crate::db::{connection, AppState};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultAsset {
    pub id: String,
    pub file_name: String,
    pub mime_type: String,
    pub ext: String,
    pub size: u64,
    pub created_at: String,
    pub relative_path: String,
    pub is_persistent: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveVaultAssetPayload {
    pub file_name: String,
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveMeshAssetToVaultPayload {
    pub relative_path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMeshAssetPayload {
    pub relative_path: String,
}

fn validate_session(conn: &Connection, token: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.query_row(
        "SELECT user_id FROM sessions WHERE id = ?1 AND expires_at > ?2",
        params![token, now],
        |_row| Ok(()),
    )
    .map_err(|_| "Invalid or expired session".to_string())
}

fn app_root_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to read current dir: {e}"))?;
    if cwd.file_name().map(|v| v == "src-tauri").unwrap_or(false) {
        cwd.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Failed to resolve app root".to_string())
    } else {
        Ok(cwd)
    }
}

fn mesh_root_dir() -> Result<PathBuf, String> {
    let root = app_root_dir()?;
    let dir = root.join("The Mesh");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create Vault directory: {e}"))?;
    Ok(dir)
}

fn vault_dir() -> Result<PathBuf, String> {
    let dir = mesh_root_dir()?.join("Vault");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create Vault directory: {e}"))?;
    Ok(dir)
}

fn mesh_workspace_dir() -> Result<PathBuf, String> {
    let dir = mesh_root_dir()?.join("Mesh");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create Mesh workspace directory: {e}"))?;
    Ok(dir)
}

fn sanitize_file_name(input: &str) -> String {
    let fallback = "asset.bin".to_string();
    let cleaned = input
        .trim()
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>();
    if cleaned.is_empty() {
        fallback
    } else {
        cleaned
    }
}

fn split_name_and_ext(file_name: &str) -> (String, String) {
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("asset")
        .to_string();
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    (stem, ext)
}

#[tauri::command]
pub fn list_vault_assets(state: State<AppState>, session_token: String) -> Result<Vec<VaultAsset>, String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;
    let dir = vault_dir()?;

    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read Vault directory: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read Vault entry: {e}"))?;
        let meta = entry
            .metadata()
            .map_err(|e| format!("Failed to read Vault metadata: {e}"))?;
        if !meta.is_file() {
            continue;
        }
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("unknown.bin")
            .to_string();
        let (_, ext) = split_name_and_ext(&file_name);
        let mime_type = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "pdf" => "application/pdf",
            _ => "application/octet-stream",
        }
        .to_string();
        let created_at = meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|| Utc::now().timestamp().to_string());

        out.push(VaultAsset {
            id: Uuid::new_v4().to_string(),
            file_name,
            mime_type,
            ext,
            size: meta.len(),
            created_at,
            relative_path: format!("The Mesh\\Vault\\{}", entry.file_name().to_string_lossy()),
            is_persistent: true,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn list_mesh_assets(state: State<AppState>, session_token: String) -> Result<Vec<VaultAsset>, String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;
    let workspace = mesh_workspace_dir()?;
    let mut out = Vec::new();
    collect_assets_from_dir(&workspace, false, "The Mesh\\Mesh", &mut out)?;
    Ok(out)
}

fn collect_assets_from_dir(
    dir: &Path,
    is_persistent: bool,
    relative_prefix: &str,
    out: &mut Vec<VaultAsset>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let meta = entry.metadata().map_err(|e| format!("Failed to read metadata: {e}"))?;
        if !meta.is_file() {
            continue;
        }
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("unknown.bin")
            .to_string();
        let (_, ext) = split_name_and_ext(&file_name);
        let mime_type = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "pdf" => "application/pdf",
            _ => "application/octet-stream",
        }
        .to_string();
        let created_at = meta
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|| Utc::now().timestamp().to_string());
        out.push(VaultAsset {
            id: Uuid::new_v4().to_string(),
            file_name: file_name.clone(),
            mime_type,
            ext,
            size: meta.len(),
            created_at,
            relative_path: format!("{relative_prefix}\\{file_name}"),
            is_persistent,
        });
    }
    Ok(())
}

#[tauri::command]
pub fn save_vault_asset(
    state: State<AppState>,
    session_token: String,
    payload: SaveVaultAssetPayload,
) -> Result<VaultAsset, String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;
    let dir = mesh_workspace_dir()?;

    let safe_name = sanitize_file_name(&payload.file_name);
    let (stem, ext) = split_name_and_ext(&safe_name);
    let unique = Uuid::new_v4().to_string();
    let final_name = if ext.is_empty() {
        format!("{stem}_{unique}")
    } else {
        format!("{stem}_{unique}.{ext}")
    };
    let file_path = dir.join(&final_name);

    let bytes = {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(payload.data_base64.as_bytes())
            .map_err(|e| format!("Failed to decode file payload: {e}"))?
    };
    fs::write(&file_path, &bytes).map_err(|e| format!("Failed to save file: {e}"))?;

    Ok(VaultAsset {
        id: unique,
        file_name: final_name.clone(),
        mime_type: payload.mime_type,
        ext,
        size: bytes.len() as u64,
        created_at: Utc::now().to_rfc3339(),
        relative_path: format!("The Mesh\\Mesh\\{final_name}"),
        is_persistent: false,
    })
}

#[tauri::command]
pub fn move_mesh_asset_to_vault(
    state: State<AppState>,
    session_token: String,
    payload: MoveMeshAssetToVaultPayload,
) -> Result<VaultAsset, String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;
    let source = app_root_dir()?.join(&payload.relative_path);
    if !source.exists() {
        return Err("Source asset not found".to_string());
    }
    let vault = vault_dir()?;
    let source_name = source
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("asset.bin")
        .to_string();
    let (stem, ext) = split_name_and_ext(&source_name);
    let unique = Uuid::new_v4().to_string();
    let target_name = if ext.is_empty() {
        format!("{stem}_{unique}")
    } else {
        format!("{stem}_{unique}.{ext}")
    };
    let target = vault.join(&target_name);
    fs::rename(&source, &target).map_err(|e| format!("Failed to move asset to vault: {e}"))?;
    let meta = target.metadata().map_err(|e| format!("Failed to read moved asset: {e}"))?;
    Ok(VaultAsset {
        id: unique,
        file_name: target_name.clone(),
        mime_type: mime_from_ext(&ext),
        ext,
        size: meta.len(),
        created_at: Utc::now().to_rfc3339(),
        relative_path: format!("The Mesh\\Vault\\{target_name}"),
        is_persistent: true,
    })
}

#[tauri::command]
pub fn delete_mesh_asset(
    state: State<AppState>,
    session_token: String,
    payload: DeleteMeshAssetPayload,
) -> Result<(), String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;
    let target = app_root_dir()?.join(payload.relative_path);
    if target.exists() {
        fs::remove_file(&target).map_err(|e| format!("Failed to delete asset: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_mesh_workspace(state: State<AppState>, session_token: String) -> Result<(), String> {
    let conn = connection(&state)?;
    validate_session(&conn, &session_token)?;
    let dir = mesh_workspace_dir()?;
    if dir.exists() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("Failed reading mesh workspace: {e}"))? {
            let entry = entry.map_err(|e| format!("Failed reading mesh workspace entry: {e}"))?;
            let p = entry.path();
            if p.is_file() {
                fs::remove_file(&p).map_err(|e| format!("Failed removing mesh workspace file: {e}"))?;
            }
        }
    }
    Ok(())
}

fn mime_from_ext(ext: &str) -> String {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
    .to_string()
}
