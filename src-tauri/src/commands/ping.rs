use std::process::Command as StdCommand;
use std::time::{Duration, Instant};

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
        let start = Instant::now();

        let output = StdCommand::new("ping")
            .arg(PING_COUNT_FLAG)
            .arg("1")
            .arg(&host)
            .output();

        let elapsed = start.elapsed();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if output.status.success() {
                    let latency = parse_ping_latency(&stdout, elapsed);

                    Ok(PingResult {
                        success: true,
                        latency: Some(latency),
                        error: None,
                    })
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

fn parse_ping_latency(output: &str, elapsed: Duration) -> f64 {
    #[cfg(target_os = "windows")]
    {
        if let Some(time_str) = output.split("time=").nth(1) {
            if let Some(ms_str) = time_str.split("ms").next() {
                if ms_str.contains('<') {
                    return 1.0;
                }
                if let Ok(latency) = ms_str.trim().parse::<f64>() {
                    return latency;
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(time_str) = output.split("time=").nth(1) {
            if let Some(ms_str) = time_str.split(" ms").next() {
                if let Ok(latency) = ms_str.trim().parse::<f64>() {
                    return latency;
                }
            }
        }
    }

    elapsed.as_secs_f64() * 1000.0
}
