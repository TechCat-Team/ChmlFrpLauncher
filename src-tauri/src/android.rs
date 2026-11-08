#[path = "commands/http.rs"]
mod http;
#[path = "commands/ping.rs"]
mod ping;

#[path = "android_service.rs"]
mod android_service;
#[path = "android_tunnels.rs"]
mod android_tunnels;

#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let _ = android_service::APP.set(app.handle().clone());
            android_tunnels::start_log_pump(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            http::http_request,
            http::http_request_raw,
            android_tunnels::start_frpc,
            android_tunnels::stop_frpc,
            android_tunnels::is_frpc_running,
            android_tunnels::get_running_tunnels,
            android_tunnels::get_frpc_status,
            android_tunnels::check_local_port,
            android_service::is_ignoring_battery_optimizations,
            android_service::request_ignore_battery_optimizations,
            android_service::open_app_settings,
            ping::ping_host
        ])
        .build(tauri::generate_context!())
        .expect("error while building Android application")
        .run(|_app, event| match event {
            // 用户从最近任务划掉应用时 Activity 被销毁，Tauri 会因“最后一个窗口关闭”请求退出进程。
            // 阻止退出，使前台服务中的隧道继续工作；重新打开时由 MainActivity.nativeInit 重建窗口
            tauri::RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::Destroyed,
                ..
            } => android_service::WINDOW_DESTROYED.store(true, std::sync::atomic::Ordering::SeqCst),
            _ => {}
        });
}
