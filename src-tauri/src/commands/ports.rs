use serde::Serialize;
use std::collections::HashSet;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::collections::HashMap;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

#[cfg(target_os = "windows")]
fn run_hidden_command(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args).creation_flags(CREATE_NO_WINDOW);

    let output = command.output().ok()?;
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(target_os = "windows")]
fn parse_tasklist_processes(tasklist_text: &str) -> HashMap<String, String> {
    tasklist_text
        .lines()
        .filter_map(|line| {
            let columns: Vec<&str> = line.trim().trim_matches('"').split("\",\"").collect();
            if columns.len() < 2 {
                return None;
            }

            Some((columns[1].to_string(), columns[0].to_string()))
        })
        .collect()
}

fn collect_ports() -> Vec<PortInfo> {
    #[cfg(target_os = "windows")]
    {
        let netstat_text = run_hidden_command("netstat", &["-ano"]).unwrap_or_default();
        let tasklist_text =
            run_hidden_command("tasklist", &["/FO", "CSV", "/NH"]).unwrap_or_default();
        let processes = parse_tasklist_processes(&tasklist_text);

        let mut result = Vec::new();

        for line in netstat_text.lines().skip(4) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.is_empty() {
                continue;
            }

            let protocol = parts[0];
            let (address, pid) = match protocol {
                "TCP" if parts.len() >= 5 && parts[3] == "LISTENING" => (parts[1], parts[4]),
                "UDP" if parts.len() >= 4 => (parts[1], parts[3]),
                _ => continue,
            };

            if let Some(port) = address.split(':').last() {
                let process_name = processes.get(pid).cloned().unwrap_or_default();

                result.push(PortInfo {
                    port: port.to_string(),
                    pid: pid.to_string(),
                    process: process_name,
                    protocol: protocol.to_string(),
                });
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
