mod commands;
mod db;
mod models;

use commands::auth::{
    complete_onboarding, get_current_user, get_onboarding_status, login, logout, register_user,
    update_profile,
};
use commands::agent::{
    generate_livekit_token, load_agent_config, save_agent_config, test_agent_connection,
};
use commands::notes::{
    create_note, delete_note, list_notes, update_note,
};
use commands::runtime::{
    copy_diagnostics, get_luna_setup_status, get_runtime_status, load_quirks_settings,
    open_logs_folder, restart_livekit, restart_luna, save_luna_api_key,
    save_luna_onboarding_env, load_luna_memory_settings, save_luna_persistent_memory,
    save_quirks_settings, RuntimeManager,
};
use commands::tasks::{
    create_task, delete_task, list_tasks, move_task, set_list_color, toggle_subtask, update_task,
};
use commands::vault::{
    clear_mesh_workspace, delete_mesh_asset, list_mesh_assets, list_vault_assets, move_mesh_asset_to_vault,
    save_vault_asset,
};
use db::{init_db, AppState};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

const TRAY_SHOW: &str = "show_quasar";
const TRAY_RESTART_LUNA: &str = "restart_luna";
const TRAY_RESTART_LIVEKIT: &str = "restart_livekit";
const TRAY_OPEN_LOGS: &str = "open_logs";
const TRAY_QUIT: &str = "quit_quasar";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let db_path = init_db(app.handle())?;
            app.manage(AppState {
                db_path: db_path.clone(),
            });
            let runtime = RuntimeManager::new(app.handle(), db_path)?;
            runtime.ensure_local_config()?;
            app.manage(runtime);
            setup_tray(app.handle())?;
            Ok(())
        })
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("quasar".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .build(),
        )
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            register_user,
            get_onboarding_status,
            complete_onboarding,
            login,
            logout,
            get_current_user,
            update_profile,
            save_agent_config,
            load_agent_config,
            generate_livekit_token,
            test_agent_connection,
            list_notes,
            create_note,
            update_note,
            delete_note,
            list_tasks,
            create_task,
            update_task,
            move_task,
            toggle_subtask,
            delete_task,
            set_list_color,
            list_vault_assets,
            list_mesh_assets,
            save_vault_asset,
            move_mesh_asset_to_vault,
            delete_mesh_asset,
            clear_mesh_workspace,
            get_runtime_status,
            restart_luna,
            restart_livekit,
            open_logs_folder,
            copy_diagnostics,
            get_luna_setup_status,
            save_luna_api_key,
            save_luna_onboarding_env,
            load_luna_memory_settings,
            save_luna_persistent_memory,
            load_quirks_settings,
            save_quirks_settings
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => {
            if app_handle
                .try_state::<RuntimeManager>()
                .map(|runtime| runtime.is_quitting())
                .unwrap_or(false)
            {
                return;
            }
            api.prevent_close();
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.hide();
            }
            let _ = commands::runtime::emit_runtime(
                app_handle,
                "Quasar is still running in the system tray",
                app_handle.state::<RuntimeManager>().status(),
            );
        }
        RunEvent::Ready => {
            let app_handle = app_handle.clone();
            let should_start = app_handle
                .try_state::<RuntimeManager>()
                .map(|runtime| runtime.mark_startup_started())
                .unwrap_or(false);
            if should_start {
                std::thread::spawn(move || {
                    let _ = commands::runtime::emit_startup(
                        &app_handle,
                        "Starting Quasar",
                        app_handle.state::<RuntimeManager>().status(),
                    );
                    if let Some(runtime) = app_handle.try_state::<RuntimeManager>() {
                        runtime.start_all(app_handle.clone());
                    }
                    let _ = commands::runtime::emit_startup(
                        &app_handle,
                        "Opening workspace",
                        app_handle.state::<RuntimeManager>().status(),
                    );
                    let ui_handle = app_handle.clone();
                    let _ = app_handle.run_on_main_thread(move || {
                        if let Some(main) = ui_handle.get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                        if let Some(splash) = ui_handle.get_webview_window("splash") {
                            let _ = splash.close();
                        }
                    });
                });
            }
        }
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            if let Some(runtime) = app_handle.try_state::<RuntimeManager>() {
                runtime.shutdown();
            }
        }
        _ => {}
    });
}

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, TRAY_SHOW, "Show Quasar", true, None::<&str>)?;
    let restart_luna = MenuItem::with_id(app, TRAY_RESTART_LUNA, "Restart Luna", true, None::<&str>)?;
    let restart_livekit = MenuItem::with_id(
        app,
        TRAY_RESTART_LIVEKIT,
        "Restart Local Server",
        true,
        None::<&str>,
    )?;
    let open_logs = MenuItem::with_id(app, TRAY_OPEN_LOGS, "Open Logs", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &restart_luna, &restart_livekit, &open_logs, &quit])?;

    TrayIconBuilder::with_id("quasar-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Quasar")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                show_main_window(app);
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW => show_main_window(app),
            TRAY_RESTART_LUNA => {
                if let Some(runtime) = app.try_state::<RuntimeManager>() {
                    let _ = runtime.restart_luna(app);
                }
            }
            TRAY_RESTART_LIVEKIT => {
                if let Some(runtime) = app.try_state::<RuntimeManager>() {
                    let _ = runtime.restart_livekit(app);
                }
            }
            TRAY_OPEN_LOGS => {
                if let Some(runtime) = app.try_state::<RuntimeManager>() {
                    let _ = runtime.open_logs_folder();
                }
            }
            TRAY_QUIT => {
                if let Some(runtime) = app.try_state::<RuntimeManager>() {
                    runtime.shutdown();
                }
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
