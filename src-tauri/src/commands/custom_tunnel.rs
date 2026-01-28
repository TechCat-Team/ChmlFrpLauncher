use crate::models::{FrpcProcesses, LogMessage, ProcessGuardState};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::process::{Command as StdCommand, Stdio};
use std::thread;
use tauri::{Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 自定义隧道信息
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CustomTunnel {
    pub id: String,
    pub name: String,
    pub config_file: String,
    pub server_addr: Option<String>,
    pub server_port: Option<u16>,
    pub tunnels: Vec<String>,        // 配置文件中的隧道名列表
    pub tunnel_type: Option<String>, // 隧道类型（tcp/udp/http/https）
    pub custom_domains: Option<String>, // HTTP/HTTPS: custom_domains
    pub subdomain: Option<String>,      // HTTP/HTTPS: subdomain
    pub local_ip: Option<String>,
    pub local_port: Option<u16>,
    pub remote_port: Option<u16>,
    pub created_at: String,
}

/// 保存自定义隧道配置
#[tauri::command]
pub async fn save_custom_tunnel(
    app_handle: tauri::AppHandle,
    _tunnel_name: String,
    config_content: String,
) -> Result<CustomTunnel, String> {
    // 解析配置文件获取隧道名
    let parsed_info = parse_ini_config(&config_content)?;

    if parsed_info.tunnel_names.is_empty() {
        return Err("配置文件中未找到隧道名称".to_string());
    }

    let tunnel_name = parsed_info.tunnel_names[0].clone();

    // 验证隧道名称只包含安全字符
    if !tunnel_name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return Err("配置文件中的隧道名称只能包含字母、数字、下划线和连字符".to_string());
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;

    // 确保目录存在
    fs::create_dir_all(&app_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    // 保存配置文件
    let config_file_name = format!("{}.ini", tunnel_name);
    let config_file_path = app_dir.join(&config_file_name);

    eprintln!("[自定义隧道] 配置文件路径: {:?}", config_file_path);

    fs::write(&config_file_path, &config_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    // 创建自定义隧道信息
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
    };

    // 保存自定义隧道列表
    save_custom_tunnel_list(&app_handle, &custom_tunnel)?;

    Ok(custom_tunnel)
}

/// 获取所有自定义隧道列表
#[tauri::command]
pub async fn get_custom_tunnels(app_handle: tauri::AppHandle) -> Result<Vec<CustomTunnel>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;

    let list_file = app_dir.join("custom_tunnels.json");

    if !list_file.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(&list_file).map_err(|e| format!("读取自定义隧道列表失败: {}", e))?;

    let tunnels: Vec<CustomTunnel> =
        serde_json::from_str(&content).map_err(|e| format!("解析自定义隧道列表失败: {}", e))?;

    let mut updated = Vec::with_capacity(tunnels.len());
    for mut t in tunnels {
        let config_path = app_dir.join(&t.config_file);
        if let Ok(cfg) = fs::read_to_string(&config_path) {
            if let Ok(parsed) = parse_ini_config(&cfg) {
                t.server_addr = parsed.server_addr.or(t.server_addr);
                t.server_port = parsed.server_port.or(t.server_port);
                t.tunnels = if parsed.tunnel_names.is_empty() {
                    t.tunnels
                } else {
                    parsed.tunnel_names
                };
                t.tunnel_type = parsed.tunnel_type.or(t.tunnel_type);
                t.custom_domains = parsed.custom_domains.or(t.custom_domains);
                t.subdomain = parsed.subdomain.or(t.subdomain);
                t.local_ip = parsed.local_ip.or(t.local_ip);
                t.local_port = parsed.local_port.or(t.local_port);
                t.remote_port = parsed.remote_port.or(t.remote_port);
            }
        }
        updated.push(t);
    }

    Ok(updated)
}

/// 删除自定义隧道
#[tauri::command]
pub async fn delete_custom_tunnel(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
) -> Result<(), String> {
    // 停止隧道（如果正在运行）
    let custom_tunnel_id = format!("custom_{}", tunnel_id);
    let tunnel_id_hash = string_to_i32(&custom_tunnel_id);

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

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;

    // 删除配置文件
    let config_file = app_dir.join(format!("{}.ini", tunnel_id));
    if config_file.exists() {
        fs::remove_file(&config_file).map_err(|e| format!("删除配置文件失败: {}", e))?;
    }

    // 从列表中移除
    let list_file = app_dir.join("custom_tunnels.json");
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

    eprintln!("[自定义隧道] 删除成功: {}", tunnel_id);
    Ok(())
}

/// 启动自定义隧道
#[tauri::command]
pub async fn start_custom_tunnel(
    app_handle: tauri::AppHandle,
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    // 生成一个唯一的进程ID
    let custom_tunnel_id = format!("custom_{}", tunnel_id);
    let tunnel_id_hash = string_to_i32(&custom_tunnel_id);

    {
        let procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        if procs.contains_key(&tunnel_id_hash) {
            return Err("该隧道已在运行中".to_string());
        }
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let frpc_path = if cfg!(target_os = "windows") {
        app_dir.join("frpc.exe")
    } else {
        app_dir.join("frpc")
    };

    if !frpc_path.exists() {
        return Err("frpc 未找到，请先下载".to_string());
    }

    // Unix系统上确保有执行权限
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

    let config_file = format!("{}.ini", tunnel_id);
    let config_path = app_dir.join(&config_file);

    if !config_path.exists() {
        return Err("配置文件不存在".to_string());
    }

    // 启动 frpc 进程
    let mut cmd = StdCommand::new(&frpc_path);
    cmd.current_dir(&app_dir)
        .arg("-c")
        .arg(&config_file)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("启动 frpc 失败: {}", e))?;

    let pid = child.id();

    // 发送启动日志
    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
    let _ = app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id: tunnel_id_hash,
            message: format!("自定义隧道 {} 进程已启动 (PID: {})", tunnel_id, pid),
            timestamp,
        },
    );

    // 捕获 stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle_clone = app_handle.clone();
        thread::Builder::new()
            .name(format!("custom-frpc-stdout-{}", tunnel_id))
            .spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    let clean_line = strip_ansi_escapes::strip_str(&line);
                    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();

                    // 检查日志是否需要停止守护
                    let guard_state_for_check = app_handle_clone.state::<ProcessGuardState>();
                    let _ = tauri::async_runtime::block_on(async {
                        crate::commands::process_guard::check_log_and_stop_guard(
                            app_handle_clone.clone(),
                            tunnel_id_hash,
                            clean_line.clone(),
                            guard_state_for_check,
                        )
                        .await
                    });

                    let _ = app_handle_clone.emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id: tunnel_id_hash,
                            message: clean_line,
                            timestamp,
                        },
                    );
                }
            })
            .ok();
    }

    // 捕获 stderr
    if let Some(stderr) = child.stderr.take() {
        let app_handle_clone = app_handle.clone();
        thread::Builder::new()
            .name(format!("custom-frpc-stderr-{}", tunnel_id))
            .spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    let clean_line = strip_ansi_escapes::strip_str(&line);
                    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();

                    // 检查错误日志是否需要停止守护
                    let guard_state_for_check = app_handle_clone.state::<ProcessGuardState>();
                    let _ = tauri::async_runtime::block_on(async {
                        crate::commands::process_guard::check_log_and_stop_guard(
                            app_handle_clone.clone(),
                            tunnel_id_hash,
                            clean_line.clone(),
                            guard_state_for_check,
                        )
                        .await
                    });

                    let _ = app_handle_clone.emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id: tunnel_id_hash,
                            message: format!("[ERR] {}", clean_line),
                            timestamp,
                        },
                    );
                }
            })
            .ok();
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

/// 停止自定义隧道
#[tauri::command]
pub async fn stop_custom_tunnel(
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let custom_tunnel_id = format!("custom_{}", tunnel_id);
    let tunnel_id_hash = string_to_i32(&custom_tunnel_id);

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

/// 检查自定义隧道是否在运行
#[tauri::command]
pub async fn is_custom_tunnel_running(
    tunnel_id: String,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    let custom_tunnel_id = format!("custom_{}", tunnel_id);
    let tunnel_id_hash = string_to_i32(&custom_tunnel_id);

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

/// INI配置解析结果
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

/// 解析INI配置文件
fn parse_ini_config(content: &str) -> Result<IniParsedInfo, String> {
    let mut server_addr = None;
    let mut server_port = None;
    let mut tunnel_names = Vec::new();
    let mut tunnel_type = None;
    let mut custom_domains = None;
    let mut subdomain = None;
    let mut local_ip = None;
    let mut local_port = None;
    let mut remote_port = None;

    let mut current_section = String::new();
    let mut tunnel_count = 0;

    for line in content.lines() {
        let line = line.trim();

        // 跳过空行和注释
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }

        // 检测段落
        if line.starts_with('[') && line.ends_with(']') {
            current_section = line[1..line.len() - 1].to_string();

            // 如果不是common段，则是隧道段
            if current_section != "common" && !current_section.is_empty() {
                tunnel_count += 1;
                if tunnel_count > 1 {
                    return Err("配置文件只能包含一个隧道段".to_string());
                }
                tunnel_names.push(current_section.clone());
            }
            continue;
        }

        // 解析键值对
        if let Some(pos) = line.find('=') {
            let key = line[..pos].trim();
            let value = line[pos + 1..].trim();

            if current_section == "common" {
                match key {
                    "server_addr" => server_addr = Some(value.to_string()),
                    "server_port" => {
                        server_port = value.parse::<u16>().ok();
                    }
                    _ => {}
                }
            } else {
                // 解析隧道段的配置
                match key {
                    "type" => tunnel_type = Some(value.to_string()),
                    "custom_domains" => custom_domains = Some(value.to_string()),
                    "subdomain" => subdomain = Some(value.to_string()),
                    "local_ip" => local_ip = Some(value.to_string()),
                    "local_port" => local_port = value.parse::<u16>().ok(),
                    "remote_port" => remote_port = value.parse::<u16>().ok(),
                    _ => {}
                }
            }
        }
    }

    if tunnel_count == 0 {
        return Err("配置文件必须包含至少一个隧道段".to_string());
    }

    Ok(IniParsedInfo {
        server_addr,
        server_port,
        tunnel_names,
        tunnel_type,
        custom_domains,
        subdomain,
        local_ip,
        local_port,
        remote_port,
    })
}

/// 保存自定义隧道到列表
fn save_custom_tunnel_list(
    app_handle: &tauri::AppHandle,
    tunnel: &CustomTunnel,
) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;

    let list_file = app_dir.join("custom_tunnels.json");

    let mut tunnels: Vec<CustomTunnel> = if list_file.exists() {
        let content =
            fs::read_to_string(&list_file).map_err(|e| format!("读取自定义隧道列表失败: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("解析自定义隧道列表失败: {}", e))?
    } else {
        Vec::new()
    };

    // 如果已存在，则更新；否则添加
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

/// 将字符串转换为i32（用于进程ID）
fn string_to_i32(s: &str) -> i32 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    let hash = hasher.finish();

    // 确保返回正数
    (hash as i32).abs()
}
