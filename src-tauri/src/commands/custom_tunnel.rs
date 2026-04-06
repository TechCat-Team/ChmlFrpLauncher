use crate::models::{FrpcProcesses, LogMessage, ProcessGuardState};
use crate::utils::resolve_frpc_path;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command as StdCommand, Stdio};
use std::thread;
use tauri::{Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CUSTOM_TUNNEL_PREFIX: &str = "custom_";
const CONFIG_FILE_PREFIX: &str = "z_";
const CONFIG_FILE_EXT: &str = ".ini";
const TUNNELS_LIST_FILE: &str = "custom_tunnels.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CustomTunnel {
    pub id: String,
    pub name: String,
    pub config_file: String,
    pub server_addr: Option<String>,
    pub server_port: Option<u16>,
    pub tunnels: Vec<String>,
    pub tunnel_type: Option<String>,
    pub custom_domains: Option<String>,
    pub subdomain: Option<String>,
    pub local_ip: Option<String>,
    pub local_port: Option<u16>,
    pub remote_port: Option<u16>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hashed_id: Option<i32>,
}

fn get_app_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))
}

fn get_custom_tunnel_hash(tunnel_id: &str) -> i32 {
    string_to_i32(&format!("{}{}", CUSTOM_TUNNEL_PREFIX, tunnel_id))
}

fn get_config_file_name(tunnel_id: &str) -> String {
    format!("{}{}{}", CONFIG_FILE_PREFIX, tunnel_id, CONFIG_FILE_EXT)
}

fn spawn_log_reader(
    app_handle: tauri::AppHandle,
    reader: Box<dyn BufRead + Send>,
    tunnel_id_hash: i32,
    tunnel_id: String,
    is_stderr: bool,
) {
    let thread_name = format!(
        "custom-frpc-{}-{}",
        if is_stderr { "stderr" } else { "stdout" },
        tunnel_id
    );

    thread::Builder::new()
        .name(thread_name)
        .spawn(move || {
            for line in reader.lines().flatten() {
                let clean_line = strip_ansi_escapes::strip_str(&line);
                let timestamp = chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string();

                let guard_state = app_handle.state::<ProcessGuardState>();
                let _ = tauri::async_runtime::block_on(async {
                    crate::commands::process_guard::check_log_and_stop_guard(
                        app_handle.clone(),
                        tunnel_id_hash,
                        clean_line.clone(),
                        guard_state,
                    )
                    .await
                });

                let message = if is_stderr {
                    format!("[ERR] {}", clean_line)
                } else {
                    clean_line
                };

                let _ = app_handle.emit(
                    "frpc-log",
                    LogMessage {
                        tunnel_id: tunnel_id_hash,
                        message,
                        timestamp,
                    },
                );
            }
        })
        .ok();
}

#[tauri::command]
pub async fn save_custom_tunnel(
    app_handle: tauri::AppHandle,
    _tunnel_name: String,
    config_content: String,
) -> Result<Vec<CustomTunnel>, String> {
    let split = split_ini_config(&config_content)?;

    if split.tunnels.is_empty() {
        return Err("配置文件中未找到隧道名称".to_string());
    }

    let app_dir = get_app_dir(&app_handle)?;
    fs::create_dir_all(&app_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let mut created = Vec::with_capacity(split.tunnels.len());

    for (tunnel_name, tunnel_block) in split.tunnels {
        if !tunnel_name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Err("配置文件中的隧道名称只能包含字母、数字、下划线和连字符".to_string());
        }

        let single_ini = if split.common.trim().is_empty() {
            tunnel_block
        } else {
            format!("{}\n\n{}", split.common, tunnel_block)
        };

        let parsed_info = parse_ini_config(&single_ini)?;

        let config_file_name = get_config_file_name(&tunnel_name);
        let config_file_path = app_dir.join(&config_file_name);

        fs::write(&config_file_path, &single_ini)
            .map_err(|e| format!("写入配置文件失败: {}", e))?;

        let custom_tunnel = CustomTunnel {
            id: tunnel_name.clone(),
            name: tunnel_name.clone(),
            config_file: config_file_name,
            server_addr: parsed_info.server_addr,
            server_port: parsed_info.server_port,
            tunnels: parsed_info.tunnel_names,
            tunnel_type: parsed_info.tunnel_type,
            custom_domains: parsed_info.custom_domains,
            subdomain: parsed_info.subdomain,
            local_ip: parsed_info.local_ip,
            local_port: parsed_info.local_port,
            remote_port: parsed_info.remote_port,
            created_at: chrono::Local::now().to_rfc3339(),
            hashed_id: Some(get_custom_tunnel_hash(&tunnel_name)),
        };

        save_custom_tunnel_list(&app_handle, &custom_tunnel)?;
        created.push(custom_tunnel);
    }

    Ok(created)
}

#[tauri::command]
pub async fn get_custom_tunnels(app_handle: tauri::AppHandle) -> Result<Vec<CustomTunnel>, String> {
    let app_dir = get_app_dir(&app_handle)?;
    let list_file = app_dir.join(TUNNELS_LIST_FILE);

    if !list_file.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(&list_file).map_err(|e| format!("读取自定义隧道列表失败: {}", e))?;

    let tunnels: Vec<CustomTunnel> =
        serde_json::from_str(&content).map_err(|e| format!("解析自定义隧道列表失败: {}", e))?;

    let updated = tunnels
        .into_iter()
        .map(|mut t| {
            let config_path = app_dir.join(&t.config_file);
            if let Ok(cfg) = fs::read_to_string(&config_path) {
                if let Ok(parsed) = parse_ini_config(&cfg) {
                    t.server_addr = parsed.server_addr.or(t.server_addr);
                    t.server_port = parsed.server_port.or(t.server_port);
                    if !parsed.tunnel_names.is_empty() {
                        t.tunnels = parsed.tunnel_names;
                    }
                    t.tunnel_type = parsed.tunnel_type.or(t.tunnel_type);
                    t.custom_domains = parsed.custom_domains.or(t.custom_domains);
                    t.subdomain = parsed.subdomain.or(t.subdomain);
                    t.local_ip = parsed.local_ip.or(t.local_ip);
                    t.local_port = parsed.local_port.or(t.local_port);
                    t.remote_port = parsed.remote_port.or(t.remote_port);
                }
            }
            t.hashed_id = Some(get_custom_tunnel_hash(&t.id));
            t
        })
        .collect();

    Ok(updated)
}

struct IniSplitResult {
    common: String,
    tunnels: Vec<(String, String)>,
}

fn split_ini_config(content: &str) -> Result<IniSplitResult, String> {
    let mut common_lines: Vec<String> = Vec::new();
    let mut tunnels: Vec<(String, Vec<String>)> = Vec::new();
    let mut current_section: Option<String> = None;

    for raw in content.lines() {
        let trimmed = raw.trim();

        if let Some(name) = parse_section_header(trimmed) {
            current_section = Some(name.clone());
            if name == "common" {
                common_lines.push(format!("[{}]", name));
            } else if !name.is_empty() {
                tunnels.push((name.clone(), vec![format!("[{}]", name)]));
            }
            continue;
        }

        match current_section.as_deref() {
            Some("common") => common_lines.push(raw.to_string()),
            Some(sec) if !sec.is_empty() && sec != "common" => {
                if let Some((_, lines)) = tunnels.last_mut() {
                    lines.push(raw.to_string());
                }
            }
            _ => {}
        }
    }

    let common = common_lines.join("\n").trim().to_string();
    let tunnels = tunnels
        .into_iter()
        .map(|(name, lines)| (name, lines.join("\n").trim().to_string()))
        .collect();

    Ok(IniSplitResult { common, tunnels })
}

fn parse_section_header(line: &str) -> Option<String> {
    if line.starts_with('[') && line.ends_with(']') {
        Some(line[1..line.len() - 1].trim().to_string())
    } else {
        None
    }
}

fn parse_key_value(line: &str) -> Option<(&str, &str)> {
    let pos = line.find('=')?;
    Some((line[..pos].trim(), line[pos + 1..].trim()))
}

#[tauri::command]
pub async fn get_custom_tunnel_config(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
) -> Result<String, String> {
    let app_dir = get_app_dir(&app_handle)?;
    let config_file_path = app_dir.join(get_config_file_name(&tunnel_id));

    if !config_file_path.exists() {
        return Err("配置文件不存在".to_string());
    }

    fs::read_to_string(&config_file_path).map_err(|e| format!("读取配置文件失败: {}", e))
}

#[tauri::command]
pub async fn update_custom_tunnel(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    config_content: String,
) -> Result<CustomTunnel, String> {
    let app_dir = get_app_dir(&app_handle)?;
    let parsed_info = parse_ini_config(&config_content)?;

    let config_file_name = get_config_file_name(&tunnel_id);
    let config_file_path = app_dir.join(&config_file_name);

    fs::write(&config_file_path, &config_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    let list_file = app_dir.join(TUNNELS_LIST_FILE);
    let existing_tunnels: Vec<CustomTunnel> = if list_file.exists() {
        let content = fs::read_to_string(&list_file)
            .map_err(|e| format!("读取自定义隧道列表失败: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("解析自定义隧道列表失败: {}", e))?
    } else {
        Vec::new()
    };

    let created_at = existing_tunnels
        .iter()
        .find(|t| t.id == tunnel_id)
        .map(|t| t.created_at.clone())
        .unwrap_or_else(|| chrono::Local::now().to_rfc3339());

    let updated_tunnel = CustomTunnel {
        id: tunnel_id.clone(),
        name: tunnel_id.clone(),
        config_file: config_file_name,
        server_addr: parsed_info.server_addr,
        server_port: parsed_info.server_port,
        tunnels: parsed_info.tunnel_names,
        tunnel_type: parsed_info.tunnel_type,
        custom_domains: parsed_info.custom_domains,
        subdomain: parsed_info.subdomain,
        local_ip: parsed_info.local_ip,
        local_port: parsed_info.local_port,
        remote_port: parsed_info.remote_port,
        created_at,
        hashed_id: Some(get_custom_tunnel_hash(&tunnel_id)),
    };

    save_custom_tunnel_list(&app_handle, &updated_tunnel)?;
    Ok(updated_tunnel)
}

#[tauri::command]
pub async fn delete_custom_tunnel(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
) -> Result<(), String> {
    let tunnel_id_hash = get_custom_tunnel_hash(&tunnel_id);

    {
        let mut procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;

        if let Some(mut child) = procs.remove(&tunnel_id_hash) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let app_dir = get_app_dir(&app_handle)?;

    let config_file = app_dir.join(get_config_file_name(&tunnel_id));
    if config_file.exists() {
        fs::remove_file(&config_file).map_err(|e| format!("删除配置文件失败: {}", e))?;
    }

    let list_file = app_dir.join(TUNNELS_LIST_FILE);
    if list_file.exists() {
        let content =
            fs::read_to_string(&list_file).map_err(|e| format!("读取自定义隧道列表失败: {}", e))?;

        let mut tunnels: Vec<CustomTunnel> =
            serde_json::from_str(&content).map_err(|e| format!("解析自定义隧道列表失败: {}", e))?;

        tunnels.retain(|t| t.id != tunnel_id);

        let content = serde_json::to_string_pretty(&tunnels)
            .map_err(|e| format!("序列化自定义隧道列表失败: {}", e))?;

        fs::write(&list_file, content).map_err(|e| format!("保存自定义隧道列表失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn start_custom_tunnel(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let tunnel_id_hash = get_custom_tunnel_hash(&tunnel_id);

    {
        let procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        if procs.contains_key(&tunnel_id_hash) {
            return Err("该隧道已在运行中".to_string());
        }
    }

    let app_dir = get_app_dir(&app_handle)?;
    let frpc_path = resolve_frpc_path(&app_handle)?;

    if !frpc_path.exists() {
        return Err("frpc 未找到，请先下载".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(&frpc_path).map_err(|e| e.to_string())?;
        let mut perms = metadata.permissions();
        if perms.mode() & 0o111 == 0 {
            perms.set_mode(0o755);
            fs::set_permissions(&frpc_path, perms).map_err(|e| e.to_string())?;
        }
    }

    let config_file = get_config_file_name(&tunnel_id);
    let config_path = app_dir.join(&config_file);

    if !config_path.exists() {
        return Err("配置文件不存在".to_string());
    }

    let mut cmd = StdCommand::new(&frpc_path);
    cmd.current_dir(&app_dir)
        .arg("-c")
        .arg(&config_file)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("启动 frpc 失败: {}", e))?;

    let pid = child.id();

    let timestamp = chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string();
    let _ = app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id: tunnel_id_hash,
            message: format!(
                "[I] [ChmlFrpLauncher] 自定义隧道 {} 进程已启动 (PID: {})",
                tunnel_id, pid
            ),
            timestamp,
        },
    );

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(
            app_handle.clone(),
            Box::new(BufReader::new(stdout)),
            tunnel_id_hash,
            tunnel_id.clone(),
            false,
        );
    }

    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(
            app_handle.clone(),
            Box::new(BufReader::new(stderr)),
            tunnel_id_hash,
            tunnel_id.clone(),
            true,
        );
    }

    {
        let mut procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        procs.insert(tunnel_id_hash, child);
    }

    let _ = crate::commands::process_guard::add_guarded_custom_tunnel(
        tunnel_id_hash,
        tunnel_id.clone(),
        guard_state,
    )
    .await;

    Ok(format!("自定义隧道已启动 (PID: {})", pid))
}

#[tauri::command]
pub async fn stop_custom_tunnel(
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let tunnel_id_hash = get_custom_tunnel_hash(&tunnel_id);

    let _ =
        crate::commands::process_guard::remove_guarded_process(tunnel_id_hash, guard_state, true)
            .await;

    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    if let Some(mut child) = procs.remove(&tunnel_id_hash) {
        match child.kill() {
            Ok(_) => {
                let _ = child.wait();
                Ok("自定义隧道已停止".to_string())
            }
            Err(e) => {
                let _ = child.wait();
                Err(format!("停止进程失败: {}", e))
            }
        }
    } else {
        Err("该隧道未在运行".to_string())
    }
}

#[tauri::command]
pub async fn is_custom_tunnel_running(
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    let tunnel_id_hash = get_custom_tunnel_hash(&tunnel_id);

    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    if let Some(child) = procs.get_mut(&tunnel_id_hash) {
        match child.try_wait() {
            Ok(Some(_)) => {
                procs.remove(&tunnel_id_hash);
                Ok(false)
            }
            Ok(None) => Ok(true),
            Err(_) => {
                procs.remove(&tunnel_id_hash);
                Ok(false)
            }
        }
    } else {
        Ok(false)
    }
}

struct IniParsedInfo {
    server_addr: Option<String>,
    server_port: Option<u16>,
    tunnel_names: Vec<String>,
    tunnel_type: Option<String>,
    custom_domains: Option<String>,
    subdomain: Option<String>,
    local_ip: Option<String>,
    local_port: Option<u16>,
    remote_port: Option<u16>,
}

fn parse_ini_config(content: &str) -> Result<IniParsedInfo, String> {
    let mut info = IniParsedInfo {
        server_addr: None,
        server_port: None,
        tunnel_names: Vec::new(),
        tunnel_type: None,
        custom_domains: None,
        subdomain: None,
        local_ip: None,
        local_port: None,
        remote_port: None,
    };

    let mut current_section = String::new();

    for line in content.lines() {
        let line = line.trim();

        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }

        if let Some(section) = parse_section_header(line) {
            current_section = section.clone();
            if current_section != "common" && !current_section.is_empty() {
                info.tunnel_names.push(current_section.clone());
            }
            continue;
        }

        if let Some((key, value)) = parse_key_value(line) {
            match current_section.as_str() {
                "common" => match key {
                    "server_addr" => info.server_addr = Some(value.to_string()),
                    "server_port" => info.server_port = value.parse().ok(),
                    _ => {}
                },
                _ if !current_section.is_empty() => match key {
                    "type" => info.tunnel_type = Some(value.to_string()),
                    "custom_domains" => info.custom_domains = Some(value.to_string()),
                    "subdomain" => info.subdomain = Some(value.to_string()),
                    "local_ip" => info.local_ip = Some(value.to_string()),
                    "local_port" => info.local_port = value.parse().ok(),
                    "remote_port" => info.remote_port = value.parse().ok(),
                    _ => {}
                },
                _ => {}
            }
        }
    }

    Ok(info)
}

fn save_custom_tunnel_list(
    app_handle: &tauri::AppHandle,
    tunnel: &CustomTunnel,
) -> Result<(), String> {
    let app_dir = get_app_dir(app_handle)?;
    let list_file = app_dir.join(TUNNELS_LIST_FILE);

    let mut tunnels: Vec<CustomTunnel> = if list_file.exists() {
        let content =
            fs::read_to_string(&list_file).map_err(|e| format!("读取自定义隧道列表失败: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("解析自定义隧道列表失败: {}", e))?
    } else {
        Vec::new()
    };

    if let Some(existing) = tunnels.iter_mut().find(|t| t.id == tunnel.id) {
        *existing = tunnel.clone();
    } else {
        tunnels.push(tunnel.clone());
    }

    let content = serde_json::to_string_pretty(&tunnels)
        .map_err(|e| format!("序列化自定义隧道列表失败: {}", e))?;

    fs::write(&list_file, content).map_err(|e| format!("保存自定义隧道列表失败: {}", e))?;

    Ok(())
}

fn string_to_i32(s: &str) -> i32 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    (hasher.finish() as i32).abs()
}
