mod commands;
mod db;
mod models;

use commands::auth::{
    get_current_user, login, logout, register_user, update_profile,
};
use commands::agent::{
    generate_livekit_token, load_agent_config, save_agent_config, test_agent_connection,
};
use commands::notes::{
    create_note, delete_note, list_notes, update_note,
};
use commands::tasks::{
    create_task, delete_task, list_tasks, move_task, set_list_color, toggle_subtask, update_task,
};
use commands::vault::{
    clear_mesh_workspace, delete_mesh_asset, list_mesh_assets, list_vault_assets, move_mesh_asset_to_vault,
    save_vault_asset,
};
use db::{init_db, AppState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = init_db(app.handle())?;
            app.manage(AppState { db_path });
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            register_user,
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
            clear_mesh_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
