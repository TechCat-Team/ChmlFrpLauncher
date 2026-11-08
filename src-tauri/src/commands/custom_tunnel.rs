use crate::models::{FrpcProcesses, LogMessage, ProcessGuardState};
use crate::utils::spawn_frpc_worker;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::thread;
use tauri::{Emitter, Manager, State};

const CUSTOM_TUNNEL_PREFIX: &str = "custom_";
const CONFIG_FILE_PREFIX: &str = "z_";
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

/// 自定义隧道配置格式。FRP 按扩展名判断格式，因此文件扩展名必须与内容一致
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ConfigFormat {
    Toml,
    Ini,
}

impl ConfigFormat {
    fn ext(self) -> &'static str {
        match self {
            ConfigFormat::Toml => "toml",
            ConfigFormat::Ini => "ini",
        }
    }

    /// 能按 TOML 解析且包含 v1 字段时视为 TOML，否则按旧版 INI 处理
    fn detect(content: &str) -> Self {
        match toml::from_str::<toml::Table>(content) {
            Ok(table)
                if ["proxies", "visitors", "serverAddr"]
                    .iter()
                    .any(|key| table.contains_key(*key)) =>
            {
                ConfigFormat::Toml
            }
            _ => ConfigFormat::Ini,
        }
    }
}

fn config_file_name(tunnel_id: &str, format: ConfigFormat) -> String {
    format!("{}{}.{}", CONFIG_FILE_PREFIX, tunnel_id, format.ext())
}

/// 自定义隧道可能使用的配置文件名（TOML 优先）
pub(super) fn config_file_names(tunnel_id: &str) -> [String; 2] {
    [
        config_file_name(tunnel_id, ConfigFormat::Toml),
        config_file_name(tunnel_id, ConfigFormat::Ini),
    ]
}

/// 查找自定义隧道当前使用的配置文件
fn find_config_file(app_dir: &Path, tunnel_id: &str) -> Option<(String, PathBuf)> {
    config_file_names(tunnel_id)
        .into_iter()
        .map(|name| {
            let path = app_dir.join(&name);
            (name, path)
        })
        .find(|(_, path)| path.is_file())
}

/// 写入配置文件，并删除另一种格式的旧文件
fn write_config_file(
    app_dir: &Path,
    tunnel_id: &str,
    content: &str,
    format: ConfigFormat,
) -> Result<String, String> {
    let file_name = config_file_name(tunnel_id, format);
    fs::write(app_dir.join(&file_name), content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    for other in config_file_names(tunnel_id) {
        if other != file_name {
            let _ = fs::remove_file(app_dir.join(other));
        }
    }
    Ok(file_name)
}

fn parse_config(content: &str) -> Result<ParsedInfo, String> {
    match ConfigFormat::detect(content) {
        ConfigFormat::Toml => parse_toml_config(content),
        ConfigFormat::Ini => parse_ini_config(content),
    }
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
    let format = ConfigFormat::detect(&config_content);
    let tunnels: Vec<(String, String)> = match format {
        ConfigFormat::Toml => split_toml_config(&config_content)?,
        ConfigFormat::Ini => {
            let split = split_ini_config(&config_content)?;
            split
                .tunnels
                .into_iter()
                .map(|(name, block)| {
                    let single = if split.common.trim().is_empty() {
                        block
                    } else {
                        format!("{}\n\n{}", split.common, block)
                    };
                    (name, single)
                })
                .collect()
        }
    };

    if tunnels.is_empty() {
        return Err("配置文件中未找到隧道名称".to_string());
    }

    let app_dir = get_app_dir(&app_handle)?;
    fs::create_dir_all(&app_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let mut created = Vec::with_capacity(tunnels.len());

    for (tunnel_name, single_config) in tunnels {
        if !tunnel_name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Err("配置文件中的隧道名称只能包含字母、数字、下划线和连字符".to_string());
        }

        let parsed_info = parse_config(&single_config)?;
        let config_file_name = write_config_file(&app_dir, &tunnel_name, &single_config, format)?;

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
            if let Some((file_name, _)) = find_config_file(&app_dir, &t.id) {
                t.config_file = file_name;
            }
            let config_path = app_dir.join(&t.config_file);
            if let Ok(cfg) = fs::read_to_string(&config_path) {
                if let Ok(parsed) = parse_config(&cfg) {
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
    let (_, config_file_path) =
        find_config_file(&app_dir, &tunnel_id).ok_or("配置文件不存在")?;

    fs::read_to_string(&config_file_path).map_err(|e| format!("读取配置文件失败: {}", e))
}

#[tauri::command]
pub async fn update_custom_tunnel(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    config_content: String,
) -> Result<CustomTunnel, String> {
    let app_dir = get_app_dir(&app_handle)?;
    let parsed_info = parse_config(&config_content)?;
    let config_file_name = write_config_file(
        &app_dir,
        &tunnel_id,
        &config_content,
        ConfigFormat::detect(&config_content),
    )?;

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
    guard_state: State<'_, ProcessGuardState>,
) -> Result<(), String> {
    stop_custom_tunnel(app_handle.clone(), tunnel_id.clone(), processes, guard_state).await?;

    let app_dir = get_app_dir(&app_handle)?;

    for name in config_file_names(&tunnel_id) {
        let config_file = app_dir.join(name);
        if config_file.exists() {
            fs::remove_file(&config_file).map_err(|e| format!("删除配置文件失败: {}", e))?;
        }
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

    let (pid, stdout, stderr) = {
        let mut procs = super::process_persistence::lock_for_start(&app_handle, &processes, tunnel_id_hash)?;
        let app_dir = get_app_dir(&app_handle)?;
        let (_, config_path) =
            find_config_file(&app_dir, &tunnel_id).ok_or("配置文件不存在")?;

        let mut child = spawn_frpc_worker(&app_dir, &config_path)?;
        let pid = child.id();

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        if let Err(error) = crate::commands::process_persistence::save_running_tunnel(
            &app_handle, tunnel_id_hash, pid, "custom", Some(tunnel_id.clone()),
        ) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        procs.insert(tunnel_id_hash, child);
        (pid, stdout, stderr)
    };

    let _ = crate::commands::process_guard::add_guarded_custom_tunnel(
        tunnel_id_hash,
        tunnel_id.clone(),
        guard_state,
    )
    .await;

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

    if let Some(stdout) = stdout {
        spawn_log_reader(
            app_handle.clone(),
            Box::new(BufReader::new(stdout)),
            tunnel_id_hash,
            tunnel_id.clone(),
            false,
        );
    }

    if let Some(stderr) = stderr {
        spawn_log_reader(
            app_handle.clone(),
            Box::new(BufReader::new(stderr)),
            tunnel_id_hash,
            tunnel_id.clone(),
            true,
        );
    }

    Ok(format!("自定义隧道已启动 (PID: {})", pid))
}

#[tauri::command]
pub async fn stop_custom_tunnel(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let tunnel_id_hash = get_custom_tunnel_hash(&tunnel_id);

    let _ =
        crate::commands::process_guard::remove_guarded_process(tunnel_id_hash, guard_state, true)
            .await;

    super::process_persistence::stop_tunnel_process(&app_handle, tunnel_id_hash, &processes, false)?;
    Ok("自定义隧道已停止".to_string())
}

#[tauri::command]
pub async fn is_custom_tunnel_running(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    let tunnel_id_hash = get_custom_tunnel_hash(&tunnel_id);

    super::process_persistence::is_tunnel_process_alive(app_handle, tunnel_id_hash, processes).await
}

struct ParsedInfo {
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

fn parse_ini_config(content: &str) -> Result<ParsedInfo, String> {
    let mut info = ParsedInfo {
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

/// 将包含多个隧道的 TOML 配置拆分为每个隧道一份配置，公共字段复制到每一份中。
/// 只有一个隧道时保留原文（包括注释）
fn split_toml_config(content: &str) -> Result<Vec<(String, String)>, String> {
    let table: toml::Table =
        toml::from_str(content).map_err(|e| format!("解析 TOML 配置失败: {}", e))?;
    let mut common = table.clone();
    let mut entries = Vec::new();
    for kind in ["proxies", "visitors"] {
        common.remove(kind);
        if let Some(items) = table.get(kind) {
            let items = items
                .as_array()
                .ok_or_else(|| format!("配置中的 {kind} 必须是数组"))?;
            for item in items {
                let item = item
                    .as_table()
                    .ok_or_else(|| format!("配置中的 {kind} 格式无效"))?;
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or("配置中存在未命名的隧道")?;
                entries.push((kind, name.to_string(), item.clone()));
            }
        }
    }
    if entries.len() == 1 {
        let (_, name, _) = entries.remove(0);
        return Ok(vec![(name, content.to_string())]);
    }
    entries
        .into_iter()
        .map(|(kind, name, item)| {
            let mut single = common.clone();
            single.insert(kind.into(), toml::Value::Array(vec![item.into()]));
            toml::to_string(&single)
                .map(|text| (name, text))
                .map_err(|e| format!("生成配置失败: {}", e))
        })
        .collect()
}

fn parse_toml_config(content: &str) -> Result<ParsedInfo, String> {
    let table: toml::Table =
        toml::from_str(content).map_err(|e| format!("解析 TOML 配置失败: {}", e))?;
    let str_of =
        |t: &toml::Table, k: &str| t.get(k).and_then(|v| v.as_str()).map(str::to_string);
    let port_of = |t: &toml::Table, k: &str| {
        t.get(k)
            .and_then(|v| v.as_integer())
            .and_then(|v| u16::try_from(v).ok())
    };

    let mut info = ParsedInfo {
        server_addr: str_of(&table, "serverAddr"),
        server_port: port_of(&table, "serverPort"),
        tunnel_names: Vec::new(),
        tunnel_type: None,
        custom_domains: None,
        subdomain: None,
        local_ip: None,
        local_port: None,
        remote_port: None,
    };

    let items = ["proxies", "visitors"]
        .iter()
        .filter_map(|kind| table.get(*kind).and_then(|v| v.as_array()))
        .flatten()
        .filter_map(|v| v.as_table());
    for item in items {
        if let Some(name) = str_of(item, "name") {
            info.tunnel_names.push(name);
        }
        // 与 INI 解析保持一致：后出现的隧道覆盖前面的信息
        info.tunnel_type = str_of(item, "type").or(info.tunnel_type);
        info.custom_domains = item
            .get("customDomains")
            .and_then(|v| v.as_array())
            .map(|domains| {
                domains
                    .iter()
                    .filter_map(|d| d.as_str())
                    .collect::<Vec<_>>()
                    .join(",")
            })
            .or(info.custom_domains);
        info.subdomain = str_of(item, "subdomain").or(info.subdomain);
        info.local_ip = str_of(item, "localIP").or(info.local_ip);
        info.local_port = port_of(item, "localPort").or(info.local_port);
        info.remote_port = port_of(item, "remotePort").or(info.remote_port);
    }

    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOML_TWO: &str = r#"serverAddr = "node.example.com"
serverPort = 7000
auth.token = "t"

[[proxies]]
name = "mc"
type = "tcp"
localPort = 25565
remotePort = 42651

[[proxies]]
name = "web"
type = "http"
localPort = 80
customDomains = ["a.example.com", "b.example.com"]
"#;

    #[test]
    fn detects_formats() {
        assert_eq!(ConfigFormat::detect(TOML_TWO), ConfigFormat::Toml);
        assert_eq!(
            ConfigFormat::detect("[common]\nserver_addr = 1.2.3.4\n\n[mc]\ntype = tcp"),
            ConfigFormat::Ini
        );
    }

    #[test]
    fn splits_toml_and_keeps_common() {
        let parts = split_toml_config(TOML_TWO).unwrap();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[1].0, "web");
        let info = parse_toml_config(&parts[1].1).unwrap();
        assert_eq!(info.server_addr.as_deref(), Some("node.example.com"));
        assert_eq!(info.tunnel_names, vec!["web".to_string()]);
        assert_eq!(info.custom_domains.as_deref(), Some("a.example.com,b.example.com"));
        assert!(parts[1].1.contains("token"));
        assert!(!parts[1].1.contains("\"mc\""));
    }

    #[test]
    fn single_toml_keeps_original_text() {
        let text = "# 注释\nserverAddr = \"x\"\n[[proxies]]\nname = \"a\"\ntype = \"tcp\"\nremotePort = 1\n";
        let parts = split_toml_config(text).unwrap();
        assert_eq!(parts, vec![("a".to_string(), text.to_string())]);
    }
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
