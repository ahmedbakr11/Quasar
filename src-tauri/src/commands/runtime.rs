use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const LIVEKIT_URL: &str = "ws://127.0.0.1:7880";
const LIVEKIT_API_KEY: &str = "quasar-local";
const LIVEKIT_ROOM: &str = "luna-room";
const LUNA_AGENT_NAME: &str = "gemini_voice_agent";
const LUNA_VOICES: &[&str] = &[
    "Puck", "Aoede", "Charon", "Fenrir", "Kore", "Orus", "Zephyr", "Gacrux",
];
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const ROTATED_LOGS: usize = 3;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub livekit: ServiceStatus,
    pub luna: ServiceStatus,
    pub logs_dir: String,
    pub livekit_url: String,
    pub room_name: String,
    pub agent_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub name: String,
    pub state: RuntimeServiceState,
    pub pid: Option<u32>,
    pub restart_count: u32,
    pub last_error: Option<String>,
    pub log_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeServiceState {
    Stopped,
    Starting,
    Running,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvent {
    pub message: String,
    pub status: RuntimeStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSnapshot {
    pub app_version: String,
    pub os: String,
    pub status: RuntimeStatus,
    pub recent_logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LunaSetupStatus {
    pub has_google_api_key: bool,
    pub app_env_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LunaMemoryFile {
    #[serde(default)]
    pub persistent_memory: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub recent_turns: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LunaMemorySettings {
    pub persistent_memory: String,
    pub memory_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuirksSettings {
    pub search_provider: String,
    pub brave_search_api_key_set: bool,
    pub outlook_enabled: bool,
    pub outlook_tenant_id: String,
    pub outlook_client_id: String,
    pub outlook_client_secret_set: bool,
    pub outlook_refresh_token_set: bool,
    pub outlook_access_token_set: bool,
    pub outlook_scopes: String,
    pub outlook_timeout_seconds: String,
    pub google_workspace_mcp_enabled: bool,
    pub google_workspace_mcp_mode: String,
    pub google_workspace_mcp_command: String,
    pub google_workspace_mcp_args: String,
    pub google_workspace_mcp_timeout_seconds: String,
    pub google_workspace_mcp_allowed_tools: String,
    pub google_workspace_client_id: String,
    pub google_workspace_client_secret_set: bool,
    pub google_workspace_refresh_token_set: bool,
    pub google_workspace_access_token_set: bool,
    pub google_workspace_enabled_capabilities: String,
    pub app_env_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveQuirksSettingsPayload {
    pub search_provider: String,
    pub brave_search_api_key: Option<String>,
    pub outlook_enabled: bool,
    pub outlook_tenant_id: String,
    pub outlook_client_id: String,
    pub outlook_client_secret: Option<String>,
    pub outlook_refresh_token: Option<String>,
    pub outlook_access_token: Option<String>,
    pub outlook_scopes: String,
    pub outlook_timeout_seconds: String,
    pub google_workspace_mcp_enabled: bool,
    pub google_workspace_mcp_mode: String,
    pub google_workspace_mcp_command: String,
    pub google_workspace_mcp_args: String,
    pub google_workspace_mcp_timeout_seconds: String,
    pub google_workspace_mcp_allowed_tools: String,
    pub google_workspace_client_id: String,
    pub google_workspace_client_secret: Option<String>,
    pub google_workspace_refresh_token: Option<String>,
    pub google_workspace_access_token: Option<String>,
    pub google_workspace_enabled_capabilities: String,
}

#[derive(Debug)]
struct ServiceRuntime {
    name: &'static str,
    state: RuntimeServiceState,
    pid: Option<u32>,
    restart_count: u32,
    last_error: Option<String>,
    log_path: PathBuf,
    child: Option<Child>,
}

impl ServiceRuntime {
    fn new(name: &'static str, log_path: PathBuf) -> Self {
        Self {
            name,
            state: RuntimeServiceState::Stopped,
            pid: None,
            restart_count: 0,
            last_error: None,
            log_path,
            child: None,
        }
    }

    fn status(&self) -> ServiceStatus {
        ServiceStatus {
            name: self.name.to_string(),
            state: self.state.clone(),
            pid: self.pid,
            restart_count: self.restart_count,
            last_error: self.last_error.clone(),
            log_path: self.log_path.to_string_lossy().to_string(),
        }
    }
}

#[derive(Debug)]
pub struct RuntimeManager {
    livekit: Mutex<ServiceRuntime>,
    luna: Mutex<ServiceRuntime>,
    app_data_dir: PathBuf,
    logs_dir: PathBuf,
    config_dir: PathBuf,
    db_path: PathBuf,
    livekit_secret: Mutex<Option<String>>,
    quitting: AtomicBool,
    startup_started: AtomicBool,
}

impl RuntimeManager {
    pub fn new(app: &AppHandle, db_path: PathBuf) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;
        let logs_dir = app_data_dir.join("logs");
        let config_dir = app_data_dir.join("runtime");
        fs::create_dir_all(&logs_dir).map_err(|e| format!("Failed to create logs directory: {e}"))?;
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create runtime directory: {e}"))?;

        Ok(Self {
            livekit: Mutex::new(ServiceRuntime::new(
                "LiveKit",
                logs_dir.join("livekit.log"),
            )),
            luna: Mutex::new(ServiceRuntime::new("Luna", logs_dir.join("luna.log"))),
            app_data_dir,
            logs_dir,
            config_dir,
            db_path,
            livekit_secret: Mutex::new(None),
            quitting: AtomicBool::new(false),
            startup_started: AtomicBool::new(false),
        })
    }

    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }

    pub fn mark_quitting(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }

    pub fn mark_startup_started(&self) -> bool {
        self.startup_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    pub fn status(&self) -> RuntimeStatus {
        RuntimeStatus {
            livekit: self.livekit.lock().unwrap().status(),
            luna: self.luna.lock().unwrap().status(),
            logs_dir: self.logs_dir.to_string_lossy().to_string(),
            livekit_url: LIVEKIT_URL.to_string(),
            room_name: LIVEKIT_ROOM.to_string(),
            agent_name: LUNA_AGENT_NAME.to_string(),
        }
    }

    pub fn ensure_local_config(&self) -> Result<String, String> {
        let secret_path = self.config_dir.join("livekit.secret");
        let secret = if secret_path.exists() {
            fs::read_to_string(&secret_path)
                .map_err(|e| format!("Failed to read LiveKit secret: {e}"))?
                .trim()
                .to_string()
        } else {
            let generated = format!("quasar-{}", Uuid::new_v4());
            fs::write(&secret_path, &generated)
                .map_err(|e| format!("Failed to write LiveKit secret: {e}"))?;
            generated
        };

        let config_path = self.livekit_config_path();
        let config = format!(
            "port: 7880\nbind_addresses:\n  - 127.0.0.1\nkeys:\n  {LIVEKIT_API_KEY}: {secret}\n"
        );
        fs::write(&config_path, config)
            .map_err(|e| format!("Failed to write LiveKit config: {e}"))?;
        self.sync_local_agent_config(&secret)?;
        *self.livekit_secret.lock().unwrap() = Some(secret.clone());
        Ok(secret)
    }

    pub fn livekit_config_path(&self) -> PathBuf {
        self.config_dir.join("livekit.yaml")
    }

    fn sync_local_agent_config(&self, secret: &str) -> Result<(), String> {
        let conn = Connection::open(&self.db_path)
            .map_err(|e| format!("Failed to open runtime DB connection: {e}"))?;
        conn.execute(
            "INSERT INTO agent_config (id, livekit_url, livekit_api_key, livekit_api_secret, room_name, agent_name)
             VALUES (1, ?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
               livekit_url = excluded.livekit_url,
               livekit_api_key = excluded.livekit_api_key,
               livekit_api_secret = excluded.livekit_api_secret,
               room_name = excluded.room_name,
               agent_name = excluded.agent_name",
            params![LIVEKIT_URL, LIVEKIT_API_KEY, secret, LIVEKIT_ROOM, LUNA_AGENT_NAME],
        )
        .map_err(|e| format!("Failed to sync local Luna config: {e}"))?;
        Ok(())
    }

    pub fn start_all(&self, app: AppHandle) {
        let _ = emit_startup(&app, "Loading modules", self.status());
        if let Err(err) = self.ensure_local_config() {
            self.fail_service("LiveKit", err, &app);
            return;
        }

        if resolve_google_api_key(&app).is_none() {
            let _ = emit_startup(&app, "Luna setup required", self.status());
            let _ = emit_runtime(&app, "Luna setup required", self.status());
            return;
        }

        let _ = emit_startup(&app, "Starting local server", self.status());
        if let Err(err) = self.start_livekit(&app) {
            self.fail_service("LiveKit", err, &app);
            return;
        }

        if let Err(err) = wait_for_tcp("127.0.0.1:7880", Duration::from_secs(8)) {
            self.fail_service("LiveKit", err, &app);
            return;
        }

        let _ = emit_startup(&app, "Starting Luna", self.status());
        if let Err(err) = self.start_luna(&app) {
            self.fail_service("Luna", err, &app);
            return;
        }

        let _ = emit_startup(&app, "Getting things ready", self.status());
        thread::sleep(Duration::from_millis(500));
        let _ = emit_runtime(&app, "Quasar runtime is ready", self.status());
    }

    pub fn restart_livekit(&self, app: &AppHandle) -> Result<RuntimeStatus, String> {
        self.stop_livekit();
        self.start_livekit(app)?;
        emit_runtime(app, "Local LiveKit server restarted", self.status())?;
        Ok(self.status())
    }

    pub fn restart_luna(&self, app: &AppHandle) -> Result<RuntimeStatus, String> {
        self.stop_luna();
        self.start_luna(app)?;
        emit_runtime(app, "Luna restarted", self.status())?;
        Ok(self.status())
    }

    pub fn shutdown(&self) {
        self.mark_quitting();
        self.stop_luna();
        self.stop_livekit();
    }

    pub fn diagnostics(&self, app: &AppHandle) -> DiagnosticSnapshot {
        let mut recent_logs = Vec::new();
        for path in [
            self.logs_dir.join("quasar.log"),
            self.logs_dir.join("livekit.log"),
            self.logs_dir.join("luna.log"),
        ] {
            recent_logs.extend(read_log_tail(&path, 40));
        }

        DiagnosticSnapshot {
            app_version: app.package_info().version.to_string(),
            os: std::env::consts::OS.to_string(),
            status: self.status(),
            recent_logs: recent_logs.into_iter().map(redact).collect(),
        }
    }

    pub fn open_logs_folder(&self) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(&self.logs_dir)
                .spawn()
                .map_err(|e| format!("Failed to open logs folder: {e}"))?;
            return Ok(());
        }

        #[allow(unreachable_code)]
        Err("Opening logs folder is not implemented for this platform".to_string())
    }

    pub fn luna_setup_status(&self, app: &AppHandle) -> LunaSetupStatus {
        LunaSetupStatus {
            has_google_api_key: resolve_google_api_key(app).is_some(),
            app_env_path: self.app_env_path().display().to_string(),
        }
    }

    pub fn save_luna_api_key(
        &self,
        app: &AppHandle,
        api_key: &str,
        persist_windows_environment: bool,
    ) -> Result<LunaSetupStatus, String> {
        let trimmed = api_key.trim();
        if trimmed.is_empty() {
            return Err("Google API key is required".to_string());
        }

        self.write_app_env_value("GOOGLE_API_KEY", trimmed)?;
        std::env::set_var("GOOGLE_API_KEY", trimmed);

        if persist_windows_environment {
            persist_windows_user_env("GOOGLE_API_KEY", trimmed)?;
        }

        Ok(self.luna_setup_status(app))
    }

    pub fn load_luna_memory_settings(&self) -> LunaMemorySettings {
        let path = self.memory_path();
        let memory = read_memory_file(&path);
        LunaMemorySettings {
            persistent_memory: memory.persistent_memory,
            memory_path: path.display().to_string(),
        }
    }

    pub fn save_luna_persistent_memory(&self, persistent_memory: &str) -> Result<LunaMemorySettings, String> {
        let path = self.memory_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create Luna memory directory: {e}"))?;
        }

        let mut memory = read_memory_file(&path);
        memory.persistent_memory = persistent_memory.trim().to_string();
        let payload = serde_json::to_string_pretty(&memory)
            .map_err(|e| format!("Failed to serialize Luna memory: {e}"))?;
        fs::write(&path, format!("{payload}\n"))
            .map_err(|e| format!("Failed to write Luna memory: {e}"))?;
        Ok(self.load_luna_memory_settings())
    }

    pub fn load_quirks_settings(&self) -> QuirksSettings {
        QuirksSettings {
            search_provider: self.env_value("LUNA_SEARCH_PROVIDER").unwrap_or_else(|| "brave".to_string()),
            brave_search_api_key_set: self.env_value("BRAVE_SEARCH_API_KEY").is_some(),
            outlook_enabled: self
                .env_value("OUTLOOK_ENABLED")
                .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
                .unwrap_or(false),
            outlook_tenant_id: self.env_value("OUTLOOK_TENANT_ID").unwrap_or_else(|| "common".to_string()),
            outlook_client_id: self.env_value("OUTLOOK_CLIENT_ID").unwrap_or_default(),
            outlook_client_secret_set: self.env_value("OUTLOOK_CLIENT_SECRET").is_some(),
            outlook_refresh_token_set: self.env_value("OUTLOOK_REFRESH_TOKEN").is_some(),
            outlook_access_token_set: self.env_value("OUTLOOK_ACCESS_TOKEN").is_some(),
            outlook_scopes: self
                .env_value("OUTLOOK_SCOPES")
                .unwrap_or_else(|| "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access".to_string()),
            outlook_timeout_seconds: self
                .env_value("OUTLOOK_TIMEOUT_SECONDS")
                .unwrap_or_else(|| "20".to_string()),
            google_workspace_mcp_enabled: self
                .env_value("GOOGLE_WORKSPACE_MCP_ENABLED")
                .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
                .unwrap_or(false),
            google_workspace_mcp_mode: self.env_value("GOOGLE_WORKSPACE_MCP_MODE").unwrap_or_else(|| "stdio".to_string()),
            google_workspace_mcp_command: self.env_value("GOOGLE_WORKSPACE_MCP_COMMAND").unwrap_or_else(|| "uvx".to_string()),
            google_workspace_mcp_args: self
                .env_value("GOOGLE_WORKSPACE_MCP_ARGS")
                .unwrap_or_else(|| "[\"--from\",\"google-workspace-mcp\",\"google-workspace-worker\",\"--transport\",\"stdio\"]".to_string()),
            google_workspace_mcp_timeout_seconds: self
                .env_value("GOOGLE_WORKSPACE_MCP_TIMEOUT_SECONDS")
                .unwrap_or_else(|| "30".to_string()),
            google_workspace_mcp_allowed_tools: self.env_value("GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS").unwrap_or_default(),
            google_workspace_client_id: self.env_value("GOOGLE_WORKSPACE_CLIENT_ID").unwrap_or_default(),
            google_workspace_client_secret_set: self.env_value("GOOGLE_WORKSPACE_CLIENT_SECRET").is_some(),
            google_workspace_refresh_token_set: self.env_value("GOOGLE_WORKSPACE_REFRESH_TOKEN").is_some(),
            google_workspace_access_token_set: self.env_value("GOOGLE_WORKSPACE_ACCESS_TOKEN").is_some(),
            google_workspace_enabled_capabilities: self
                .env_value("GOOGLE_WORKSPACE_ENABLED_CAPABILITIES")
                .unwrap_or_else(|| "[\"gmail\",\"calendar\",\"tasks\"]".to_string()),
            app_env_path: self.app_env_path().display().to_string(),
        }
    }

    pub fn save_quirks_settings(&self, payload: SaveQuirksSettingsPayload) -> Result<QuirksSettings, String> {
        let search_provider = payload.search_provider.trim().to_ascii_lowercase();
        if !matches!(search_provider.as_str(), "brave" | "duckduckgo") {
            return Err("Search provider must be brave or duckduckgo".to_string());
        }
        let mcp_mode = payload.google_workspace_mcp_mode.trim().to_ascii_lowercase();
        if !matches!(mcp_mode.as_str(), "remote" | "http" | "streamable_http" | "stdio") {
            return Err("Google Workspace MCP mode must be remote or stdio".to_string());
        }

        let timeout = payload.google_workspace_mcp_timeout_seconds.trim();
        if timeout.parse::<f64>().is_err() {
            return Err("MCP timeout must be a number of seconds".to_string());
        }
        let outlook_timeout = payload.outlook_timeout_seconds.trim();
        if outlook_timeout.parse::<f64>().is_err() {
            return Err("Outlook timeout must be a number of seconds".to_string());
        }

        let mut env_values = vec![
            ("LUNA_SEARCH_PROVIDER", search_provider),
            (
                "OUTLOOK_ENABLED",
                if payload.outlook_enabled { "1" } else { "0" }.to_string(),
            ),
            (
                "OUTLOOK_TENANT_ID",
                payload.outlook_tenant_id.trim().to_string(),
            ),
            (
                "OUTLOOK_CLIENT_ID",
                payload.outlook_client_id.trim().to_string(),
            ),
            (
                "OUTLOOK_SCOPES",
                payload.outlook_scopes.trim().to_string(),
            ),
            (
                "OUTLOOK_TIMEOUT_SECONDS",
                outlook_timeout.to_string(),
            ),
            (
                "GOOGLE_WORKSPACE_MCP_ENABLED",
                if payload.google_workspace_mcp_enabled { "1" } else { "0" }.to_string(),
            ),
            (
                "GOOGLE_WORKSPACE_MCP_MODE",
                mcp_mode.clone(),
            ),
            (
                "GOOGLE_WORKSPACE_MCP_COMMAND",
                payload.google_workspace_mcp_command.trim().to_string(),
            ),
            (
                "GOOGLE_WORKSPACE_MCP_ARGS",
                payload.google_workspace_mcp_args.trim().to_string(),
            ),
            (
                "GOOGLE_WORKSPACE_MCP_TIMEOUT_SECONDS",
                timeout.to_string(),
            ),
            (
                "GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS",
                payload.google_workspace_mcp_allowed_tools.trim().to_string(),
            ),
            (
                "GOOGLE_WORKSPACE_CLIENT_ID",
                payload.google_workspace_client_id.trim().to_string(),
            ),
            (
                "GOOGLE_WORKSPACE_ENABLED_CAPABILITIES",
                normalize_google_workspace_capabilities(
                    &payload.google_workspace_enabled_capabilities,
                    &mcp_mode,
                ),
            ),
        ];

        if let Some(value) = payload.brave_search_api_key {
            if !value.trim().is_empty() {
                env_values.push(("BRAVE_SEARCH_API_KEY", value.trim().to_string()));
            }
        }
        if let Some(value) = payload.outlook_client_secret {
            if !value.trim().is_empty() {
                env_values.push(("OUTLOOK_CLIENT_SECRET", value.trim().to_string()));
            }
        }
        if let Some(value) = payload.outlook_refresh_token {
            if !value.trim().is_empty() {
                env_values.push(("OUTLOOK_REFRESH_TOKEN", value.trim().to_string()));
            }
        }
        if let Some(value) = payload.outlook_access_token {
            if !value.trim().is_empty() {
                env_values.push(("OUTLOOK_ACCESS_TOKEN", value.trim().to_string()));
            }
        }
        if let Some(value) = payload.google_workspace_client_secret {
            if !value.trim().is_empty() {
                env_values.push(("GOOGLE_WORKSPACE_CLIENT_SECRET", compact_secret(&value)));
            }
        }
        if let Some(value) = payload.google_workspace_refresh_token {
            if !value.trim().is_empty() {
                env_values.push(("GOOGLE_WORKSPACE_REFRESH_TOKEN", compact_secret(&value)));
            }
        }
        if let Some(value) = payload.google_workspace_access_token {
            if !value.trim().is_empty() {
                env_values.push(("GOOGLE_WORKSPACE_ACCESS_TOKEN", compact_secret(&value)));
            }
        }

        self.write_app_env_values(&env_values)?;
        for (key, value) in &env_values {
            std::env::set_var(key, value);
        }
        Ok(self.load_quirks_settings())
    }

    pub fn save_luna_onboarding_env(
        &self,
        app: &AppHandle,
        voice: &str,
        persona: &str,
        google_api_key: &str,
    ) -> Result<LunaSetupStatus, String> {
        let voice = voice.trim();
        let persona = persona.trim();
        let google_api_key = google_api_key.trim();

        if !LUNA_VOICES.contains(&voice) {
            return Err("Unsupported Luna voice".to_string());
        }
        if persona.is_empty() {
            return Err("Luna personality is required".to_string());
        }
        if google_api_key.is_empty() {
            return Err("Google API key is required".to_string());
        }

        let secret = self.ensure_local_config()?;
        let vault_dir = self.app_data_dir.join("Vault");
        fs::create_dir_all(&vault_dir).map_err(|e| format!("Failed to create Luna vault directory: {e}"))?;
        let vault_path = normalize_env_path(&vault_dir);
        let memory_path = normalize_env_path(&self.app_data_dir.join("memory.json"));
        let env_values = vec![
            ("LIVEKIT_URL", LIVEKIT_URL.to_string()),
            ("LIVEKIT_API_KEY", LIVEKIT_API_KEY.to_string()),
            ("LIVEKIT_API_SECRET", secret),
            ("GOOGLE_API_KEY", google_api_key.to_string()),
            ("GOOGLE_GENAI_USE_VERTEXAI", "0".to_string()),
            ("GEMINI_REALTIME_MODEL", "gemini-3.1-flash-live-preview".to_string()),
            ("AGENT_NAME", LUNA_AGENT_NAME.to_string()),
            ("AGENT_VOICE", voice.to_string()),
            ("AGENT_PERSONA", persona.to_string()),
            ("AGENT_MEMORY_RECENT_ITEMS", "12".to_string()),
            ("AGENT_MEMORY_SUMMARY_MAX_CHARS", "3000".to_string()),
            ("AGENT_MEMORY_FILE", memory_path),
            ("GOOGLE_WORKSPACE_MCP_ENABLED", "0".to_string()),
            ("GOOGLE_WORKSPACE_MCP_MODE", "stdio".to_string()),
            ("GOOGLE_WORKSPACE_MCP_COMMAND", "uvx".to_string()),
            (
                "GOOGLE_WORKSPACE_MCP_ARGS",
                "[\"--from\",\"google-workspace-mcp\",\"google-workspace-worker\",\"--transport\",\"stdio\"]".to_string(),
            ),
            ("GOOGLE_WORKSPACE_MCP_TIMEOUT_SECONDS", "30".to_string()),
            ("GOOGLE_WORKSPACE_MCP_ALLOWED_TOOLS", "".to_string()),
            ("GOOGLE_WORKSPACE_CLIENT_ID", "".to_string()),
            ("GOOGLE_WORKSPACE_CLIENT_SECRET", "".to_string()),
            ("GOOGLE_WORKSPACE_REFRESH_TOKEN", "".to_string()),
            ("OUTLOOK_ENABLED", "0".to_string()),
            ("OUTLOOK_TENANT_ID", "common".to_string()),
            ("OUTLOOK_CLIENT_ID", "".to_string()),
            ("OUTLOOK_CLIENT_SECRET", "".to_string()),
            ("OUTLOOK_REFRESH_TOKEN", "".to_string()),
            ("OUTLOOK_ACCESS_TOKEN", "".to_string()),
            (
                "OUTLOOK_SCOPES",
                "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access".to_string(),
            ),
            ("OUTLOOK_TIMEOUT_SECONDS", "20".to_string()),
            (
                "GOOGLE_WORKSPACE_ENABLED_CAPABILITIES",
                "[\"gmail\",\"calendar\",\"tasks\"]".to_string(),
            ),
            ("GEMINI_DELEGATION_MODEL", "gemini-2.5-flash".to_string()),
            ("LUNA_DELEGATION_MAX_OUTPUT_TOKENS", "6000".to_string()),
            ("LUNA_DELEGATION_INPUT_CHARS_PER_FILE", "12000".to_string()),
            ("LUNA_DELEGATION_OUTPUT_DIR", vault_path.clone()),
            ("AGENT_VAULT_PATH", vault_path.clone()),
            (
                "AGENT_STATIC_FACTS",
                format!("Primary workspace is {vault_path}|Use Vault as default doc input and output folder"),
            ),
        ];

        self.write_app_env_values(&env_values)?;
        for (key, value) in &env_values {
            std::env::set_var(key, value);
        }
        persist_windows_user_env("GOOGLE_API_KEY", google_api_key)?;

        Ok(self.luna_setup_status(app))
    }

    fn app_env_path(&self) -> PathBuf {
        self.app_data_dir.join(".env")
    }

    fn memory_path(&self) -> PathBuf {
        self.app_data_dir.join("memory.json")
    }

    fn write_app_env_value(&self, key: &str, value: &str) -> Result<(), String> {
        self.write_app_env_values(&[(key, value.to_string())])
    }

    fn env_value(&self, key: &str) -> Option<String> {
        read_env_file_value(&self.app_env_path(), key)
    }

    fn write_app_env_values(&self, values: &[(&str, String)]) -> Result<(), String> {
        let env_path = self.app_env_path();
        if let Some(parent) = env_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create runtime environment directory: {e}"))?;
        }

        let mut lines = fs::read_to_string(&env_path)
            .unwrap_or_default()
            .lines()
            .map(ToString::to_string)
            .collect::<Vec<_>>();

        for (key, value) in values {
            let prefix = format!("{key}=");
            let mut replaced = false;
            for line in &mut lines {
                if line.trim_start().starts_with(&prefix) {
                    *line = format!("{key}={}", quote_env_value(value));
                    replaced = true;
                }
            }
            if !replaced {
                lines.push(format!("{key}={}", quote_env_value(value)));
            }
        }

        fs::write(&env_path, format!("{}\n", lines.join("\n")))
            .map_err(|e| format!("Failed to write Luna runtime environment: {e}"))
    }

    fn start_livekit(&self, app: &AppHandle) -> Result<(), String> {
        let executable = resolve_livekit_executable(app, &self.app_data_dir);
        let config_path = self.livekit_config_path();
        let mut command = Command::new(&executable);
        command.arg("--config").arg(&config_path);
        hide_child_console(&mut command);
        self.spawn_service(app, &self.livekit, command, "LiveKit")
    }

    fn start_luna(&self, app: &AppHandle) -> Result<(), String> {
        let secret = self
            .livekit_secret
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "LiveKit secret is not initialized".to_string())?;
        let mut command = resolve_luna_command(app, &self.app_data_dir);
        let google_api_key = resolve_google_api_key(app);
        command
            .arg("start")
            .env("LIVEKIT_URL", LIVEKIT_URL)
            .env("LIVEKIT_API_KEY", LIVEKIT_API_KEY)
            .env("LIVEKIT_API_SECRET", secret)
            .env("LIVEKIT_ROOM", LIVEKIT_ROOM)
            .env("AGENT_NAME", LUNA_AGENT_NAME)
            .env("LUNA_WORKER_PORT", "0")
            .env("RUST_LOG", "info")
            .env("LUNA_LOG_LEVEL", "info")
            .current_dir(resolve_luna_working_dir(app));
        apply_runtime_env_file(&mut command, &self.app_env_path());
        if let Some(api_key) = google_api_key {
            command.env("GOOGLE_API_KEY", api_key);
        }
        hide_child_console(&mut command);
        self.spawn_service(app, &self.luna, command, "Luna")
    }

    fn spawn_service(
        &self,
        app: &AppHandle,
        service_mutex: &Mutex<ServiceRuntime>,
        mut command: Command,
        service_name: &'static str,
    ) -> Result<(), String> {
        let mut service = service_mutex.lock().unwrap();
        stop_child(&mut service);
        service.state = RuntimeServiceState::Starting;
        service.pid = None;
        service.last_error = None;
        rotate_log(&service.log_path);

        terminate_stale_service_processes(service_name, command.get_program());

        command.stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|e| format!("{service_name} failed to start: {e}"))?;

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        spawn_log_reader(stdout, service.log_path.clone(), service_name, "stdout");
        spawn_log_reader(stderr, service.log_path.clone(), service_name, "stderr");

        service.state = RuntimeServiceState::Running;
        service.pid = Some(pid);
        service.child = Some(child);
        thread::sleep(Duration::from_millis(500));
        if let Some(exit_status) = service
            .child
            .as_mut()
            .and_then(|child| child.try_wait().ok())
            .flatten()
        {
            service.state = RuntimeServiceState::Failed;
            service.pid = None;
            service.child = None;
            service.last_error = Some(format!("{service_name} exited early: {exit_status}"));
            return Err(format!("{service_name} exited early: {exit_status}"));
        }
        drop(service);
        let _ = emit_runtime(app, &format!("{service_name} started"), self.status());
        Ok(())
    }

    fn stop_livekit(&self) {
        let mut service = self.livekit.lock().unwrap();
        stop_child(&mut service);
    }

    fn stop_luna(&self) {
        let mut service = self.luna.lock().unwrap();
        stop_child(&mut service);
    }

    fn fail_service(&self, service_name: &'static str, error: String, app: &AppHandle) {
        let service_mutex = if service_name == "LiveKit" {
            &self.livekit
        } else {
            &self.luna
        };
        {
            let mut service = service_mutex.lock().unwrap();
            service.state = RuntimeServiceState::Failed;
            service.last_error = Some(error.clone());
        }
        let _ = emit_runtime(app, &format!("{service_name} failed: {error}"), self.status());
    }
}

#[tauri::command]
pub fn get_runtime_status(runtime: State<RuntimeManager>) -> RuntimeStatus {
    runtime.status()
}

#[tauri::command]
pub fn restart_luna(
    app: AppHandle,
    runtime: State<RuntimeManager>,
) -> Result<RuntimeStatus, String> {
    runtime.restart_luna(&app)
}

#[tauri::command]
pub fn restart_livekit(
    app: AppHandle,
    runtime: State<RuntimeManager>,
) -> Result<RuntimeStatus, String> {
    runtime.restart_livekit(&app)
}

#[tauri::command]
pub fn open_logs_folder(runtime: State<RuntimeManager>) -> Result<(), String> {
    runtime.open_logs_folder()
}

#[tauri::command]
pub fn copy_diagnostics(
    app: AppHandle,
    runtime: State<RuntimeManager>,
) -> DiagnosticSnapshot {
    runtime.diagnostics(&app)
}

#[tauri::command]
pub fn get_luna_setup_status(
    app: AppHandle,
    runtime: State<RuntimeManager>,
) -> LunaSetupStatus {
    runtime.luna_setup_status(&app)
}

#[tauri::command]
pub fn save_luna_api_key(
    app: AppHandle,
    runtime: State<RuntimeManager>,
    api_key: String,
    persist_windows_environment: bool,
) -> Result<LunaSetupStatus, String> {
    runtime.save_luna_api_key(&app, &api_key, persist_windows_environment)
}

#[tauri::command]
pub fn save_luna_onboarding_env(
    app: AppHandle,
    runtime: State<RuntimeManager>,
    voice: String,
    persona: String,
    google_api_key: String,
) -> Result<LunaSetupStatus, String> {
    runtime.save_luna_onboarding_env(&app, &voice, &persona, &google_api_key)
}

#[tauri::command]
pub fn load_luna_memory_settings(
    runtime: State<RuntimeManager>,
) -> LunaMemorySettings {
    runtime.load_luna_memory_settings()
}

#[tauri::command]
pub fn save_luna_persistent_memory(
    runtime: State<RuntimeManager>,
    persistent_memory: String,
) -> Result<LunaMemorySettings, String> {
    runtime.save_luna_persistent_memory(&persistent_memory)
}

#[tauri::command]
pub fn load_quirks_settings(runtime: State<RuntimeManager>) -> QuirksSettings {
    runtime.load_quirks_settings()
}

#[tauri::command]
pub fn save_quirks_settings(
    runtime: State<RuntimeManager>,
    payload: SaveQuirksSettingsPayload,
) -> Result<QuirksSettings, String> {
    runtime.save_quirks_settings(payload)
}

pub fn emit_startup(app: &AppHandle, message: &str, status: RuntimeStatus) -> Result<(), String> {
    app.emit(
        "quasar://startup-progress",
        RuntimeEvent {
            message: message.to_string(),
            status,
        },
    )
    .map_err(|e| e.to_string())
}

pub fn emit_runtime(app: &AppHandle, message: &str, status: RuntimeStatus) -> Result<(), String> {
    app.emit(
        "quasar://runtime-status",
        RuntimeEvent {
            message: message.to_string(),
            status,
        },
    )
    .map_err(|e| e.to_string())
}

fn resolve_livekit_executable(app: &AppHandle, app_data_dir: &Path) -> PathBuf {
    if let Ok(path) = std::env::var("QUASAR_LIVEKIT_SERVER") {
        return PathBuf::from(path);
    }

    for candidate in ["resources/bin/livekit-server.exe", "bin/livekit-server.exe"] {
        if let Ok(resource) = app
            .path()
            .resolve(candidate, tauri::path::BaseDirectory::Resource)
        {
            if resource.exists() {
                return resource;
            }
        }
    }

    app_data_dir.join("bin").join("livekit-server.exe")
}

fn resolve_luna_command(app: &AppHandle, app_data_dir: &Path) -> Command {
    if let Ok(path) = std::env::var("QUASAR_LUNA_AGENT") {
        return Command::new(path);
    }

    for candidate in ["resources/bin/luna-agent.exe", "bin/luna-agent.exe"] {
        if let Ok(resource) = app
            .path()
            .resolve(candidate, tauri::path::BaseDirectory::Resource)
        {
            if resource.exists() {
                return Command::new(resource);
            }
        }
    }

    let fallback = app_data_dir.join("bin").join("luna-agent.exe");
    if fallback.exists() {
        return Command::new(fallback);
    }

    let mut command = Command::new("python");
    command.arg("agent.py");
    command
}

fn resolve_luna_working_dir(app: &AppHandle) -> PathBuf {
    if let Ok(path) = std::env::var("QUASAR_LUNA_WORKDIR") {
        return PathBuf::from(path);
    }

    if cfg!(debug_assertions) {
        if let Ok(cwd) = std::env::current_dir() {
            let repo_luna = cwd.join("../Luna_Agent");
            if repo_luna.exists() {
                return repo_luna;
            }
        }
    }

    let app_data = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&app_data);
    app_data
}

fn resolve_google_api_key(app: &AppHandle) -> Option<String> {
    env_or_file_value(app, "GOOGLE_API_KEY").or_else(|| env_or_file_value(app, "GEMINI_API_KEY"))
}

fn env_or_file_value(app: &AppHandle, key: &str) -> Option<String> {
    if let Ok(value) = std::env::var(key) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let env_paths = [
        app.path()
            .app_data_dir()
            .ok()
            .map(|dir| dir.join(".env")),
        app.path()
            .app_data_dir()
            .ok()
            .map(|dir| dir.join("Luna_Agent").join(".env")),
        app.path()
            .resource_dir()
            .ok()
            .map(|dir| dir.join(".env")),
        app.path()
            .resource_dir()
            .ok()
            .map(|dir| dir.join("Luna_Agent").join(".env")),
        std::env::current_dir().ok().map(|dir| dir.join(".env")),
        std::env::current_dir()
            .ok()
            .map(|dir| dir.join("Luna_Agent").join(".env")),
    ];

    for path in env_paths.into_iter().flatten() {
        if let Some(value) = read_env_file_value(&path, key) {
            return Some(value);
        }
    }

    None
}

fn read_env_file_value(path: &Path, key: &str) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let Some((raw_key, raw_value)) = trimmed.split_once('=') else {
            continue;
        };
        if raw_key.trim() != key {
            continue;
        }

        let value = raw_value.trim().trim_matches('"').trim_matches('\'').trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
}

fn apply_runtime_env_file(command: &mut Command, path: &Path) {
    for (key, value) in read_env_file_entries(path) {
        command.env(key, value);
    }
}

fn read_env_file_entries(path: &Path) -> Vec<(String, String)> {
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };

    content
        .lines()
        .filter_map(parse_env_line)
        .collect::<Vec<_>>()
}

fn read_memory_file(path: &Path) -> LunaMemoryFile {
    let Ok(content) = fs::read_to_string(path) else {
        return LunaMemoryFile::default();
    };

    serde_json::from_str::<LunaMemoryFile>(&content).unwrap_or_default()
}

fn parse_env_line(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let (raw_key, raw_value) = trimmed.split_once('=')?;
    let key = raw_key.trim();
    if key.is_empty() {
        return None;
    }
    Some((key.to_string(), unquote_env_value(raw_value.trim())))
}

fn unquote_env_value(value: &str) -> String {
    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        let inner = &value[1..value.len() - 1];
        let mut output = String::new();
        let mut chars = inner.chars();
        while let Some(ch) = chars.next() {
            if ch == '\\' {
                if let Some(next) = chars.next() {
                    output.push(next);
                }
            } else {
                output.push(ch);
            }
        }
        return output;
    }

    value.trim_matches('\'').to_string()
}

fn quote_env_value(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn normalize_google_workspace_capabilities(raw: &str, mode: &str) -> String {
    let trimmed = raw.trim();
    let allowed = if mode == "stdio" {
        vec!["gmail", "calendar", "tasks"]
    } else {
        vec!["gmail", "drive", "calendar", "people", "chat"]
    };
    if trimmed.is_empty() {
        return serde_json::to_string(&allowed)
            .unwrap_or_else(|_| "[\"gmail\",\"calendar\",\"tasks\"]".to_string());
    }

    let mut values = Vec::new();
    if trimmed.starts_with('[') {
        if let Ok(parsed) = serde_json::from_str::<Vec<String>>(trimmed) {
            for item in parsed {
                let lowered = item.trim().to_ascii_lowercase();
                if allowed.contains(&lowered.as_str()) && !values.contains(&lowered) {
                    values.push(lowered);
                }
            }
        }
    } else {
        for item in trimmed.split(',') {
            let lowered = item.trim().to_ascii_lowercase();
            if allowed.contains(&lowered.as_str()) && !values.contains(&lowered) {
                values.push(lowered);
            }
        }
    }

    if values.is_empty() {
        values = allowed.iter().map(|item| item.to_string()).collect();
    }
    serde_json::to_string(&values)
        .unwrap_or_else(|_| "[\"gmail\",\"calendar\",\"tasks\"]".to_string())
}

fn compact_secret(value: &str) -> String {
    value.chars().filter(|ch| !ch.is_whitespace()).collect()
}

fn normalize_env_path(path: &Path) -> String {
    path.display().to_string().replace('\\', "/")
}

fn persist_windows_user_env(key: &str, value: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("setx")
            .arg(key)
            .arg(value)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Failed to persist Windows environment variable: {e}"))?;

        if !status.success() {
            return Err("Failed to persist Windows environment variable with setx".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (key, value);
    }

    Ok(())
}

fn stop_child(service: &mut ServiceRuntime) {
    if let Some(mut child) = service.child.take() {
        terminate_process_tree(child.id());
        let _ = child.kill();
        let _ = child.wait();
    }
    service.state = RuntimeServiceState::Stopped;
    service.pid = None;
}

fn terminate_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
    }
}

fn terminate_stale_service_processes(service_name: &'static str, program: &std::ffi::OsStr) {
    #[cfg(target_os = "windows")]
    {
        let Some(image_name) = Path::new(program).file_name().and_then(|name| name.to_str()) else {
            return;
        };
        let expected = match service_name {
            "Luna" => "luna-agent.exe",
            "LiveKit" => "livekit-server.exe",
            _ => return,
        };
        if !image_name.eq_ignore_ascii_case(expected) {
            return;
        }

        let _ = Command::new("taskkill")
            .arg("/IM")
            .arg(expected)
            .arg("/T")
            .arg("/F")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (service_name, program);
    }
}

fn wait_for_tcp(addr: &str, timeout: Duration) -> Result<(), String> {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if TcpStream::connect(addr).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err(format!("Timed out waiting for {addr}"))
}

fn hide_child_console(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn spawn_log_reader(
    stream: Option<impl std::io::Read + Send + 'static>,
    log_path: PathBuf,
    service_name: &'static str,
    stream_name: &'static str,
) {
    if let Some(stream) = stream {
        thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines().map_while(Result::ok) {
                append_log(&log_path, &format!("[{service_name}:{stream_name}] {}", redact(line)));
            }
        });
    }
}

fn append_log(path: &Path, line: &str) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

fn rotate_log(path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() < MAX_LOG_BYTES {
        return;
    }

    for index in (1..=ROTATED_LOGS).rev() {
        let source = if index == 1 {
            path.to_path_buf()
        } else {
            path.with_extension(format!("log.{}", index - 1))
        };
        let target = path.with_extension(format!("log.{index}"));
        if source.exists() {
            let _ = fs::rename(source, target);
        }
    }
    let _ = File::create(path);
}

fn read_log_tail(path: &Path, lines: usize) -> Vec<String> {
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut rows: Vec<String> = content.lines().map(|line| line.to_string()).collect();
    if rows.len() > lines {
        rows = rows.split_off(rows.len() - lines);
    }
    rows
}

fn redact(input: impl AsRef<str>) -> String {
    let mut output = input.as_ref().to_string();
    for key in [
        "LIVEKIT_API_SECRET",
        "GEMINI_API_KEY",
        "GOOGLE_WORKSPACE_REFRESH_TOKEN",
        "OUTLOOK_CLIENT_SECRET",
        "OUTLOOK_REFRESH_TOKEN",
        "OUTLOOK_ACCESS_TOKEN",
        "sessionToken",
        "refresh_token",
        "api_secret",
    ] {
        output = output.replace(key, &format!("{key}_REDACTED"));
    }
    output
}
