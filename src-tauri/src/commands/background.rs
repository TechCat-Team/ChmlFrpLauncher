use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub async fn copy_background_video(
    app_handle: tauri::AppHandle,
    source_path: String,
) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let background_dir = app_dir.join("backgrounds");
    fs::create_dir_all(&background_dir).map_err(|e| e.to_string())?;

    let source = PathBuf::from(&source_path);
    let file_name = source
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();

    let dest_path = background_dir.join(&file_name);

    fs::copy(&source_path, &dest_path).map_err(|e| {
        format!("复制文件失败: {}", e)
    })?;

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn copy_background_image(
    app_handle: tauri::AppHandle,
    source_path: String,
) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let background_dir = app_dir.join("backgrounds");
    fs::create_dir_all(&background_dir).map_err(|e| e.to_string())?;

    let source = PathBuf::from(&source_path);
    let file_name = source
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();

    let dest_path = background_dir.join(&file_name);

    fs::copy(&source_path, &dest_path).map_err(|e| {
        format!("复制文件失败: {}", e)
    })?;

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_background_video_path(
    app_handle: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let background_dir = app_dir.join("backgrounds");
    
    if !background_dir.exists() {
        return Ok(None);
    }

    let entries = fs::read_dir(&background_dir).map_err(|e| e.to_string())?;
    
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                if matches!(ext_lower.as_str(), "mp4" | "webm" | "ogv" | "mov") {
                    return Ok(Some(path.to_string_lossy().to_string()));
                }
            }
        }
    }

    Ok(None)
}

