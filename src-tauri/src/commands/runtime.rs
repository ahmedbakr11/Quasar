use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const LIVEKIT_URL: &str = "ws://127.0.0.1:7880";
const LIVEKIT_API_KEY: &str = "quasar-local";
const LIVEKIT_ROOM: &str = "luna-room";
const LUNA_AGENT_NAME: &str = "gemini_voice_agent";
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const ROTATED_LOGS: usize = 3;

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
    livekit_secret: Mutex<Option<String>>,
    quitting: AtomicBool,
}

impl RuntimeManager {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
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
            livekit_secret: Mutex::new(None),
            quitting: AtomicBool::new(false),
        })
    }

    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }

    pub fn mark_quitting(&self) {
        self.quitting.store(true, Ordering::SeqCst);
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
        *self.livekit_secret.lock().unwrap() = Some(secret.clone());
        Ok(secret)
    }

    pub fn livekit_config_path(&self) -> PathBuf {
        self.config_dir.join("livekit.yaml")
    }

    pub fn start_all(&self, app: AppHandle) {
        let _ = emit_startup(&app, "Loading modules", self.status());
        if let Err(err) = self.ensure_local_config() {
            self.fail_service("LiveKit", err, &app);
            return;
        }

        let _ = emit_startup(&app, "Starting local server", self.status());
        if let Err(err) = self.start_livekit(&app) {
            self.fail_service("LiveKit", err, &app);
            return;
        }

        thread::sleep(Duration::from_millis(900));
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

    fn start_livekit(&self, app: &AppHandle) -> Result<(), String> {
        let executable = resolve_livekit_executable(app, &self.app_data_dir);
        let config_path = self.livekit_config_path();
        let mut command = Command::new(&executable);
        command.arg("--config").arg(&config_path);
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
        command
            .arg("start")
            .env("LIVEKIT_URL", LIVEKIT_URL)
            .env("LIVEKIT_API_KEY", LIVEKIT_API_KEY)
            .env("LIVEKIT_API_SECRET", secret)
            .env("LIVEKIT_ROOM", LIVEKIT_ROOM)
            .env("AGENT_NAME", LUNA_AGENT_NAME)
            .env("RUST_LOG", "info")
            .env("LUNA_LOG_LEVEL", "info")
            .current_dir(resolve_luna_working_dir(app));
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

    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("Luna_Agent")
}

fn stop_child(service: &mut ServiceRuntime) {
    if let Some(mut child) = service.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    service.state = RuntimeServiceState::Stopped;
    service.pid = None;
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
        "sessionToken",
        "refresh_token",
        "api_secret",
    ] {
        output = output.replace(key, &format!("{key}_REDACTED"));
    }
    output
}
