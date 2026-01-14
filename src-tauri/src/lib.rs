mod models;
mod utils;
mod commands;

pub use models::{FrpcProcesses, ProcessGuardState};

use tauri::{Manager, Emitter, menu::{MenuBuilder, MenuItemBuilder}, tray::{TrayIconBuilder, TrayIconEvent}};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.emit("window-close-requested", ());
                    }
                });
            }

            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    if let Err(e) = window.set_title("") {
                        eprintln!("Failed to set window title: {:?}", e);
                    }
                }
                
                #[cfg(target_os = "windows")]
                {
                    if let Err(e) = window.set_decorations(false) {
                        eprintln!("Failed to set decorations: {:?}", e);
                    }
                }
            }
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            let app_handle = app.handle().clone();
            commands::process_guard::start_guard_monitor(app_handle);
            
            Ok(())
        })
        .manage(FrpcProcesses::new())
        .manage(ProcessGuardState::new())
        .invoke_handler(tauri::generate_handler![
            commands::check_frpc_exists,
            commands::get_frpc_directory,
            commands::get_download_url,
            commands::download_frpc,
            commands::start_frpc,
            commands::stop_frpc,
            commands::is_frpc_running,
            commands::get_running_tunnels,
            commands::test_log_event,
            commands::is_autostart_enabled,
            commands::set_autostart,
            commands::http_request,
            commands::hide_window,
            commands::show_window,
            commands::quit_app,
            commands::ping_host,
            commands::save_custom_tunnel,
            commands::get_custom_tunnels,
            commands::delete_custom_tunnel,
            commands::start_custom_tunnel,
            commands::stop_custom_tunnel,
            commands::is_custom_tunnel_running,
            commands::process_guard::set_process_guard_enabled,
            commands::process_guard::get_process_guard_enabled,
            commands::process_guard::add_guarded_process,
            commands::process_guard::add_guarded_custom_tunnel,
            commands::process_guard::remove_guarded_process,
            commands::process_guard::check_log_and_stop_guard
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            {
                if let tauri::RunEvent::Reopen { .. } = event {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if !window.is_visible().unwrap_or(true) {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app_handle, event);
            }
        });
}
