use serde::Serialize;
use std::collections::HashSet;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize)]
pub struct PortInfo {
    pub port: String,
    pub pid: String,
    pub process: String,
    pub protocol: String,
}

#[derive(Serialize)]
pub struct PortCheckResult {
    pub occupied: bool,
    pub pid: Option<String>,
    pub process: Option<String>,
}

fn deduplicate_ports(items: Vec<PortInfo>) -> Vec<PortInfo> {
    let mut seen = HashSet::new();
    let mut deduplicated = Vec::new();

    for item in items {
        let key = format!(
            "{}|{}|{}|{}",
            item.port, item.pid, item.process, item.protocol
        );
        if seen.insert(key) {
            deduplicated.push(item);
        }
    }

    deduplicated.sort_by(|a, b| {
        let a_port = a.port.parse::<u32>().unwrap_or(u32::MAX);
        let b_port = b.port.parse::<u32>().unwrap_or(u32::MAX);

        a_port
            .cmp(&b_port)
            .then_with(|| a.pid.cmp(&b.pid))
            .then_with(|| a.process.cmp(&b.process))
            .then_with(|| a.protocol.cmp(&b.protocol))
    });

    deduplicated
}

fn collect_ports() -> Vec<PortInfo> {
    #[cfg(target_os = "windows")]
    {
        let netstat = Command::new("netstat")
            .args(["-ano"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .expect("failed to execute netstat");
        let netstat_text = String::from_utf8_lossy(&netstat.stdout);

        let tasklist = Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .expect("failed to execute tasklist");
        let tasklist_text = String::from_utf8_lossy(&tasklist.stdout);

        let mut result = Vec::new();

        for line in netstat_text.lines() {
            if !line.contains("LISTENING") {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 {
                let address = parts[1];
                let pid = parts[4];
                if let Some(port) = address.split(':').last() {
                    let process_name = tasklist_text
                        .lines()
                        .find(|l| l.contains(pid))
                        .and_then(|l| l.split(',').next())
                        .unwrap_or("")
                        .trim_matches('"');

                    result.push(PortInfo {
                        port: port.to_string(),
                        pid: pid.to_string(),
                        process: process_name.to_string(),
                        protocol: parts[0].to_string(),
                    });
                }
            }
        }

        deduplicate_ports(result)
    }

    #[cfg(target_os = "linux")]
    {
        let output = Command::new("sh")
            .args(["-c", "netstat -lnptu 2>/dev/null | tail -n +3"])
            .output()
            .expect("failed to execute netstat");
        let text = String::from_utf8_lossy(&output.stdout);

        let mut result = Vec::new();
        for line in text.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 7 {
                let address = parts[3];
                let pid_proc = parts[6];
                if let Some(port) = address.split(':').last() {
                    let mut split = pid_proc.split('/');
                    let pid = split.next().unwrap_or("");
                    let process = split.next().unwrap_or("");
                    result.push(PortInfo {
                        port: port.to_string(),
                        pid: pid.to_string(),
                        process: process.to_string(),
                        protocol: parts[0].to_string(),
                    });
                }
            }
        }

        deduplicate_ports(result)
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("sh")
            .args(["-c", "lsof -n -P -iTCP -sTCP:LISTEN -iUDP"])
            .output()
            .expect("failed to execute lsof");
        let text = String::from_utf8_lossy(&output.stdout);

        let mut result = Vec::new();
        for line in text.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 9 {
                let process = parts[0];
                let pid = parts[1];
                let port_part = parts[8];
                if let Some(port) = port_part.split(':').last() {
                    result.push(PortInfo {
                        port: port.to_string(),
                        pid: pid.to_string(),
                        process: process.to_string(),
                        protocol: parts[7].to_string(),
                    });
                }
            }
        }

        deduplicate_ports(result)
    }
}

#[tauri::command]
pub async fn get_ports() -> Vec<PortInfo> {
    tauri::async_runtime::spawn_blocking(collect_ports)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn check_local_port(port: String) -> PortCheckResult {
    tauri::async_runtime::spawn_blocking(move || {
        let matched = collect_ports().into_iter().find(|item| item.port == port);

        match matched {
            Some(port_info) => PortCheckResult {
                occupied: true,
                pid: Some(port_info.pid),
                process: Some(port_info.process),
            },
            None => PortCheckResult {
                occupied: false,
                pid: None,
                process: None,
            },
        }
    })
    .await
    .unwrap_or(PortCheckResult {
        occupied: false,
        pid: None,
        process: None,
    })
}
