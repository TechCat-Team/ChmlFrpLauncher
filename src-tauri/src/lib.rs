mod commands;
mod models;
mod utils;

pub use models::{FrpcProcesses, ProcessGuardState};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager,
};

const AUTO_START_CONFIG_FILE: &str = "auto_start_tunnels.json";

fn get_auto_start_tunnels_setting(app_handle: &tauri::AppHandle) -> bool {
    let Some(app_data_dir) = app_handle.path().app_data_dir().ok() else {
        return false;
    };
    let config_path = app_data_dir.join(AUTO_START_CONFIG_FILE);
    if !config_path.exists() {
        return false;
    }
    let Ok(content) = std::fs::read_to_string(&config_path) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .and_then(|config| config.get("enabled").and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

fn save_auto_start_tunnels_setting(app_handle: &tauri::AppHandle, enabled: bool) -> bool {
    let Some(app_data_dir) = app_handle.path().app_data_dir().ok() else {
        return false;
    };
    if std::fs::create_dir_all(&app_data_dir).is_err() {
        return false;
    }
    let config_path = app_data_dir.join(AUTO_START_CONFIG_FILE);
    let config = serde_json::json!({ "enabled": enabled });
    std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap()).is_ok()
}

fn cleanup_official_tunnel_configs(app_handle: &tauri::AppHandle) {
    let Ok(app_data_dir) = app_handle.path().app_data_dir() else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&app_data_dir) else {
        return;
    };
    for entry in entries.flatten() {
        if let Ok(file_name) = entry.file_name().into_string() {
            if file_name.starts_with("g_") && file_name.ends_with(".ini") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

fn build_tray_menu(app: &tauri::App) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let auto_start_tunnels = get_auto_start_tunnels_setting(&app.handle());
    let auto_start_label = if auto_start_tunnels {
        "✓ 启动软件时自动启动隧道"
    } else {
        "启动软件时自动启动隧道"
    };

    let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
    let auto_start_item = MenuItemBuilder::with_id("auto_start_tunnels", auto_start_label).build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&auto_start_item)
        .separator()
        .item(&quit_item)
        .build()
        .map_err(Into::into)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let menu = build_tray_menu(app)?;

            let tray_icon = app
                .default_window_icon()
                .cloned()
                .expect("Failed to load tray icon: default window icon not found");

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "auto_start_tunnels" => {
                        let app_handle = app.clone();
                        let current_setting = get_auto_start_tunnels_setting(&app_handle);
                        let new_setting = !current_setting;

                        if save_auto_start_tunnels_setting(&app_handle, new_setting) {
                            let _ = app_handle.emit("auto-start-tunnels-changed", new_setting);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

                                match window.is_visible() {
                                    Ok(true) => {
                                        let _ = window.hide();
                                    }
                                    Ok(false) => {
                                        let _ = window.show();
                                    }
                                    Err(_) => {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            });
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

            let app_handle_deeplink = app.handle().clone();
            app.handle().listen("deep-link://new-url", move |_event| {
                if let Some(window) = app_handle_deeplink.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            let app_handle = app.handle().clone();
            commands::process_guard::start_guard_monitor(app_handle.clone());

            cleanup_official_tunnel_configs(&app_handle);

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
            commands::is_autostart_enabled,
            commands::set_autostart,
            commands::get_auto_start_tunnels,
            commands::get_tunnel_auto_start,
            commands::set_tunnel_auto_start,
            commands::http_request,
            commands::http_request_raw,
            commands::hide_window,
            commands::show_window,
            commands::quit_app,
            commands::ping_host,
            commands::tcping_host,
            commands::get_ports,
            commands::check_local_port,
            commands::save_custom_tunnel,
            commands::get_custom_tunnels,
            commands::get_custom_tunnel_config,
            commands::delete_custom_tunnel,
            commands::update_custom_tunnel,
            commands::start_custom_tunnel,
            commands::stop_custom_tunnel,
            commands::is_custom_tunnel_running,
            commands::copy_background_video,
            commands::copy_background_image,
            commands::get_background_video_path,
            commands::process_guard::set_process_guard_enabled,
            commands::process_guard::get_process_guard_enabled,
            commands::process_guard::add_guarded_process,
            commands::process_guard::add_guarded_custom_tunnel,
            commands::process_guard::remove_guarded_process,
            commands::process_guard::check_log_and_stop_guard,
            commands::fix_frpc_ini_tls,
            commands::resolve_domain_to_ip,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            _ => {
                #[cfg(not(target_os = "macos"))]
                let _ = app_handle;
            }
        });
}
