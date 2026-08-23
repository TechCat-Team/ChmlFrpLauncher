mod commands;
mod models;
mod utils;

pub use models::{FrpcProcesses, ProcessGuardState};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager,
};

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
    let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&quit_item)
        .build()
        .map_err(Into::into)
}

use std::fs;

#[tauri::command]
fn read_image_folder(dir_path: String) -> Vec<String> {
    let mut images = Vec::new();
    let extensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if extensions.contains(&ext.to_lowercase().as_str()) {
                        images.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    images
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
                            // 使用异步方式处理窗口显示/隐藏以避免Windows上的竞态条件
                             tauri::async_runtime::spawn(async move {
                                 // 短暂延时确保系统状态稳定
                                 tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

                                 // 获取当前窗口状态并相应处理
                                 match window.is_visible() {
                                     Ok(true) => {
                                         // 窗口可见，将其隐藏
                                         let _ = window.hide();
                                     }
                                     Ok(false) => {
                                         // 窗口不可见，将其显示并聚焦
                                         let _ = window.show();
                                     }
                                     Err(_) => {
                                         // 如果无法获取窗口状态，默认显示窗口
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

                #[cfg(any(target_os = "windows", target_os = "linux"))]
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

            // 恢复还在运行的节点进程
            let recovered = commands::process_persistence::recover_running_tunnels(&app_handle);
            if !recovered.is_empty() {
                // eprintln!("[启动] 发现 {} 个仍在运行的隧道进程", recovered.len());
                for _info in &recovered {
                    // eprintln!(
                    //     "[启动] 隧道 {} (PID: {}, 类型: {}) 仍在运行",
                    //     info.tunnel_id, info.pid, info.tunnel_type
                    // );
                }
            }

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
            commands::get_tunnel_auto_start,
            commands::set_tunnel_auto_start,
            commands::http_request,
            commands::http_request_raw,
            commands::hide_window,
            commands::show_window,
            commands::quit_app,
            commands::ping_host,
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
            read_image_folder,
            commands::copy_background_video,
            commands::copy_background_image,
            commands::import_background_image_folder,
            commands::get_background_video_path,
            commands::process_guard::set_process_guard_enabled,
            commands::process_guard::get_process_guard_enabled,
            commands::process_guard::add_guarded_process,
            commands::process_guard::add_guarded_custom_tunnel,
            commands::process_guard::remove_guarded_process,
            commands::process_guard::check_log_and_stop_guard,
            commands::fix_frpc_ini_tls,
            commands::resolve_domain_to_ip,
            commands::process_persistence::get_persisted_running_tunnels,
            commands::process_persistence::stop_orphan_process,
            commands::process_persistence::is_tunnel_process_alive,
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
