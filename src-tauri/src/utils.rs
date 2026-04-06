use std::path::PathBuf;
use tauri::Manager;

// 隐藏用户日志里面的token
pub fn sanitize_log(message: &str, secrets: &[&str]) -> String {
    let mut result = message.to_string();
    for secret in secrets {
        if secret.is_empty() {
            continue;
        }
        result = sanitize_token(&result, secret);
    }
    result
}

pub fn frpc_file_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "frpc.exe"
    } else {
        "frpc"
    }
}

pub fn app_data_frpc_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.join(frpc_file_name()))
}

pub fn resolve_frpc_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_path = app_data_frpc_path(app_handle)?;
    if app_path.exists() {
        return Ok(app_path);
    }

    let bundled_path = bundled_frpc_candidates(app_handle)
        .into_iter()
        .find(|path| path.exists());
    let Some(bundled_path) = bundled_path else {
        return Ok(app_path);
    };

    if let Some(parent) = app_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if std::fs::copy(&bundled_path, &app_path).is_ok() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(&app_path) {
                let mut perms = metadata.permissions();
                if perms.mode() & 0o111 == 0 {
                    perms.set_mode(0o755);
                    let _ = std::fs::set_permissions(&app_path, perms);
                }
            }
        }
        return Ok(app_path);
    }

    Ok(bundled_path)
}

fn bundled_frpc_candidates(app_handle: &tauri::AppHandle) -> Vec<PathBuf> {
    let file_name = frpc_file_name();
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidates.push(resource_dir.join(file_name));
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("resources").join(file_name));
            candidates.push(exe_dir.join(file_name));
            candidates.push(exe_dir.join("..").join("Resources").join(file_name));
        }
    }

    candidates
}

fn sanitize_token(message: &str, token: &str) -> String {
    let mut result = message.to_string();

    result = result.replace(&format!("{}.", token), "");
    result = result.replace(&format!("{}-", token), "");
    result = result.replace(token, "");

    if let Some(dot_pos) = token.find('.') {
        let first_part = &token[..dot_pos];
        let second_part = &token[dot_pos + 1..];

        if first_part.len() >= 6 {
            result = result.replace(first_part, "***");
        }
        if second_part.len() >= 6 {
            result = result.replace(second_part, "***");
        }
    }

    if token.len() >= 10 {
        for window_size in (8..=token.len()).rev() {
            if window_size <= token.len() {
                let substr = &token[..window_size];
                if result.contains(substr) && substr.len() >= 8 {
                    result = result.replace(substr, "***");
                }
            }
        }
    }

    result
}
