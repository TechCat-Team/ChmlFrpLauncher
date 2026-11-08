use std::path::Path;
use std::process::{Child, Command, Stdio};

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

pub const FRPC_WORKER_ARG: &str = "--frpc-worker";

pub fn spawn_frpc_worker(app_dir: &Path, config_path: &Path) -> Result<Child, String> {
    let executable = std::env::current_exe().map_err(|e| format!("获取启动器路径失败: {e}"))?;
    let mut command = Command::new(executable);
    command
        .current_dir(app_dir)
        .arg(FRPC_WORKER_ARG)
        .arg(config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    command.spawn().map_err(|e| format!("启动 FRP worker 失败: {e}"))
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
