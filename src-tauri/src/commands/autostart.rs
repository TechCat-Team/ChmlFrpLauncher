#[tauri::command]
pub async fn is_autostart_enabled(
    state: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
) -> Result<bool, String> {
    state
        .is_enabled()
        .map_err(|e| format!("检查开机自启状态失败: {}", e))
}

#[tauri::command]
pub async fn set_autostart(
    enabled: bool,
    state: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
) -> Result<(), String> {
    if enabled {
        state
            .enable()
            .map_err(|e| format!("启用开机自启失败: {}", e))
    } else {
        state
            .disable()
            .map_err(|e| format!("禁用开机自启失败: {}", e))
    }
}
