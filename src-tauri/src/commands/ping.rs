use std::process::Command as StdCommand;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const PING_COUNT_FLAG: &str = "-n";

#[cfg(not(target_os = "windows"))]
const PING_COUNT_FLAG: &str = "-c";

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PingResult {
    pub success: bool,
    pub latency: Option<f64>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn ping_host(host: String) -> Result<PingResult, String> {
    tokio::task::spawn_blocking(move || {
        let mut cmd = StdCommand::new("ping");
        cmd.arg(PING_COUNT_FLAG)
            .arg("1");

        #[cfg(target_os = "windows")]
        {
            cmd.arg("-w").arg("3000");
            cmd.creation_flags(0x08000000);
        }

        cmd.arg(&host);

        let output = cmd.output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if output.status.success() {
                    let latency_str = parse_ping_latency(&stdout);
                    let latency_bytes = if latency_str.is_none() {
                        parse_ping_latency_from_bytes(&output.stdout)
                    } else {
                        None
                    };
                    
                    if let Some(latency) = latency_str.or(latency_bytes) {
                        Ok(PingResult {
                            success: true,
                            latency: Some(latency),
                            error: None,
                        })
                    } else {
                        let preview: Vec<String> = stdout.lines().take(5).map(|s| s.to_string()).collect();
                        let debug_info = format!(
                            "Failed to parse ping output. First 5 lines: {:?}",
                            preview
                        );
                        Ok(PingResult {
                            success: false,
                            latency: None,
                            error: Some(debug_info),
                        })
                    }
                } else {
                    let error_msg = if !stderr.is_empty() {
                        stderr.to_string()
                    } else {
                        stdout.to_string()
                    };

                    Ok(PingResult {
                        success: false,
                        latency: None,
                        error: Some(format!(
                            "Ping failed: {}",
                            error_msg.lines().next().unwrap_or("Unknown error")
                        )),
                    })
                }
            }
            Err(e) => Ok(PingResult {
                success: false,
                latency: None,
                error: Some(format!("Failed to execute ping: {}", e)),
            }),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn parse_ping_latency(output: &str) -> Option<f64> {
    #[cfg(target_os = "windows")]
    {
        for pattern in &["时间=", "time="] {
            if let Some(pos) = output.find(pattern) {
                let after_pattern = &output[pos + pattern.len()..];
                if let Some(ms_pos) = after_pattern.find("ms") {
                    let num_str = &after_pattern[..ms_pos];
                    let cleaned: String = num_str.chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                    if !cleaned.is_empty() {
                        if let Ok(latency) = cleaned.parse::<f64>() {
                            return Some(latency);
                        }
                    }
                }
            }
        }
        
        for pattern in &["时间<", "time<"] {
            if let Some(pos) = output.find(pattern) {
                let after_pattern = &output[pos + pattern.len()..];
                if let Some(ms_pos) = after_pattern.find("ms") {
                    let num_str = &after_pattern[..ms_pos];
                    let cleaned: String = num_str.chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                    if !cleaned.is_empty() {
                        if let Ok(latency) = cleaned.parse::<f64>() {
                            return Some(latency.max(0.1));
                        }
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(time_str) = output.split("time=").nth(1) {
            if let Some(ms_str) = time_str.split(" ms").next() {
                if let Ok(latency) = ms_str.trim().parse::<f64>() {
                    return Some(latency);
                }
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn parse_ping_latency_from_bytes(bytes: &[u8]) -> Option<f64> {
    let ms_pattern = b"ms";
    let mut i = 0;
    
    while i < bytes.len().saturating_sub(ms_pattern.len()) {
        if bytes[i..i + ms_pattern.len()] == *ms_pattern {
            let end = i;
            let mut start = i;
            let mut found_digit = false;
            
            while start > 0 && (bytes[start - 1] == b' ' || bytes[start - 1] == b'\t') {
                start -= 1;
            }
            
            while start > 0 {
                let byte = bytes[start - 1];
                if byte.is_ascii_digit() || byte == b'.' {
                    found_digit = true;
                    start -= 1;
                } else if byte == b'=' || byte == b'<' {
                    if found_digit {
                        let num_bytes = &bytes[start..end];
                        if let Ok(num_str) = String::from_utf8(num_bytes.to_vec()) {
                            if let Ok(latency) = num_str.parse::<f64>() {
                                return Some(latency);
                            }
                        }
                    }
                    break;
                } else {
                    break;
                }
            }
        }
        i += 1;
    }
    
    None
}

#[cfg(not(target_os = "windows"))]
fn parse_ping_latency_from_bytes(_bytes: &[u8]) -> Option<f64> {
    None
}
