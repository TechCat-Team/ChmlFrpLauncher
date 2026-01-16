use tauri::Manager;

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

/// 获取指定隧道的自动启动设置
#[tauri::command]
pub async fn get_tunnel_auto_start(
    tunnel_type: String, // "api" or "custom"
    tunnel_id: String,   // String ID (can be number as string for api, or uuid for custom)
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let config_path = app_data_dir.join("tunnel_auto_start.json");
    
    if !config_path.exists() {
        return Ok(false);
    }
    
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;
    
    let key = format!("{}_{}", tunnel_type, tunnel_id);
    Ok(config.get(&key).and_then(|v| v.as_bool()).unwrap_or(false))
}

/// 设置指定隧道的自动启动
#[tauri::command]
pub async fn set_tunnel_auto_start(
    tunnel_type: String, // "api" or "custom"
    tunnel_id: String,   // String ID (can be number as string for api, or uuid for custom)
    enabled: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    
    let config_path = app_data_dir.join("tunnel_auto_start.json");
    
    let mut config: serde_json::Map<String, serde_json::Value> = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置文件失败: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("解析配置文件失败: {}", e))?
    } else {
        serde_json::Map::new()
    };
    
    let key = format!("{}_{}", tunnel_type, tunnel_id);
    config.insert(key, serde_json::Value::Bool(enabled));
    
    std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    
    Ok(())
}

/// 获取所有自动启动的隧道列表
#[tauri::command]
pub async fn get_auto_start_tunnels(
    app: tauri::AppHandle,
) -> Result<Vec<(String, String)>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let config_path = app_data_dir.join("tunnel_auto_start.json");
    
    if !config_path.exists() {
        return Ok(vec![]);
    }
    
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    let config: serde_json::Map<String, serde_json::Value> = serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))?;
    
    let mut result = vec![];
    for (key, value) in config {
        if let Some(true) = value.as_bool() {
            // 解析 key 格式: "api_123" or "custom_uuid"
            if let Some((tunnel_type, id_str)) = key.rsplit_once('_') {
                result.push((tunnel_type.to_string(), id_str.to_string()));
            }
        }
    }
    
    Ok(result)
}
