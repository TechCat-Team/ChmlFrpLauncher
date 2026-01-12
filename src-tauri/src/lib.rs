// 核心模块
mod models;
mod utils;

// 命令模块
mod commands;

// 导出模块供外部使用
pub use models::FrpcProcesses;

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
            // 创建系统托盘菜单
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // 创建系统托盘图标
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
            
            // 监听窗口关闭请求事件
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // 阻止默认关闭行为，让前端处理
                        api.prevent_close();
                        // 触发前端的关闭处理逻辑
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
            Ok(())
        })
        .manage(FrpcProcesses::new())
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
            commands::show_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
