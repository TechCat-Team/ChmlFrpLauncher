#[path = "commands/http.rs"]
mod http;

#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![http::http_request, http::http_request_raw])
        .run(tauri::generate_context!())
        .expect("error while running Android application");
}
