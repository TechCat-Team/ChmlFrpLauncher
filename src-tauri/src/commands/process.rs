use crate::models::{FrpcProcesses, LogMessage, ProcessGuardState, TunnelConfig};
use crate::utils::{resolve_frpc_path, sanitize_log};
use std::fmt::Write;
use std::io::{BufRead, BufReader};
use std::process::{Command as StdCommand, Stdio};
use std::thread;
use tauri::{Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn spawn_log_reader(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    user_token: String,
    node_token: String,
    reader: impl std::io::Read + Send + 'static,
    is_stderr: bool,
) {
    let thread_name = if is_stderr {
        format!("frpc-stderr-{}", tunnel_id)
    } else {
        format!("frpc-stdout-{}", tunnel_id)
    };

    if let Err(e) = thread::Builder::new()
        .name(thread_name)
        .spawn(move || {
            let reader = BufReader::new(reader);
            for line in reader.lines() {
                let Ok(line) = line else {
                    break;
                };
                let clean_line = strip_ansi_escapes::strip_str(&line);
                let sanitized_line =
                    sanitize_log(&clean_line, &[user_token.as_str(), node_token.as_str()]);
                let timestamp = chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string();

                let guard_state = app_handle.state::<ProcessGuardState>();
                let _ = tauri::async_runtime::block_on(async {
                    crate::commands::process_guard::check_log_and_stop_guard(
                        app_handle.clone(),
                        tunnel_id,
                        sanitized_line.clone(),
                        guard_state,
                    )
                    .await
                });

                let message = if is_stderr {
                    format!("[ERR] {}", sanitized_line)
                } else {
                    sanitized_line
                };

                if app_handle
                    .emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id,
                            message,
                            timestamp,
                        },
                    )
                    .is_err()
                {
                    break;
                }
            }
        })
    {
        eprintln!(
            "[错误] 创建 {} 监听线程失败: {}",
            if is_stderr { "stderr" } else { "stdout" },
            e
        );
    }
}

#[tauri::command]
pub async fn start_frpc(
    app_handle: tauri::AppHandle,
    config: TunnelConfig,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let tunnel_id = config.tunnel_id;
    let user_token = config.user_token.clone();
    let node_token = config.node_token.clone();

    {
        let procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        if procs.contains_key(&tunnel_id) {
            return Err("该隧道已在运行中".to_string());
        }
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("创建应用目录失败: {}", e))?;

    let config_path = app_dir.join(format!("g_{}.ini", tunnel_id));
    let config_content = generate_frpc_config(&config)?;

    std::fs::write(&config_path, config_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    #[cfg(unix)]
    {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&config_path)
            .map_err(|e| format!("获取配置文件权限失败: {}", e))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&config_path, perms)
            .map_err(|e| format!("设置配置文件权限失败: {}", e))?;
    }

    let frpc_path = resolve_frpc_path(&app_handle)?;

    if !frpc_path.exists() {
        return Err("frpc 未找到，请先下载".to_string());
    }

    #[cfg(unix)]
    {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(&frpc_path).map_err(|e| e.to_string())?;
        let mut perms = metadata.permissions();
        if perms.mode() & 0o111 == 0 {
            perms.set_mode(0o755);
            fs::set_permissions(&frpc_path, perms).map_err(|e| e.to_string())?;
        }
    }

    let mut cmd = StdCommand::new(&frpc_path);
    cmd.current_dir(&app_dir)
        .arg("-c")
        .arg(&config_path)
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
            tunnel_id,
            message: format!(
                "[I] [ChmlFrpLauncher] frpc 进程已启动 (PID: {}), 开始连接服务器...",
                pid
            ),
            timestamp: timestamp.clone(),
        },
    );

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(
            app_handle.clone(),
            tunnel_id,
            user_token.clone(),
            node_token.clone(),
            stdout,
            false,
        );
    }

    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(
            app_handle.clone(),
            tunnel_id,
            user_token,
            node_token,
            stderr,
            true,
        );
    }

    {
        let mut procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        procs.insert(tunnel_id, child);
    }

    // 持久化 PID 信息
    let _ = crate::commands::process_persistence::save_running_tunnel(
        &app_handle, tunnel_id, pid, "api", None,
    );

    let _ = crate::commands::process_guard::add_guarded_process(tunnel_id, config, guard_state)
        .await;

    Ok(format!("frpc 已启动 (PID: {})", pid))
}

#[tauri::command]
pub async fn stop_frpc(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    let _ =
        crate::commands::process_guard::remove_guarded_process(tunnel_id, guard_state, true).await;

    // 先在独立作用域中检查进程管理器，确保 MutexGuard 在调用 stop_orphan_process 前被 drop
    let found_in_manager = {
        let mut procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;

        if let Some(mut child) = procs.remove(&tunnel_id) {
            let result = match child.kill() {
                Ok(_) => {
                    let _ = child.wait();
                    Ok("frpc 已停止".to_string())
                }
                Err(e) => {
                    let _ = child.wait();
                    Err(format!("停止进程失败: {}", e))
                }
            };

            let _ = crate::commands::process_persistence::remove_running_tunnel(
                &app_handle, tunnel_id,
            );

            let app_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?;
            let config_path = app_dir.join(format!("g_{}.ini", tunnel_id));
            if config_path.exists() {
                let _ = std::fs::remove_file(&config_path);
            }

            return result;
        }

        false
    }; // MutexGuard 在此处被 drop

    if !found_in_manager {
        // 不在进程管理器中，尝试通过持久化的 PID 终止孤儿进程
        let _ = crate::commands::process_persistence::stop_orphan_process(
            app_handle.clone(), tunnel_id, processes,
        )
        .await
        .ok();

        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let config_path = app_dir.join(format!("g_{}.ini", tunnel_id));
        if config_path.exists() {
            let _ = std::fs::remove_file(&config_path);
        }

        Ok("frpc 已停止".to_string())
    } else {
        Ok("frpc 已停止".to_string())
    }
}

#[tauri::command]
pub async fn is_frpc_running(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    // 先检查进程管理器（在独立作用域中，确保 MutexGuard 被 drop）
    let in_process_manager = {
        let mut procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;

        if let Some(child) = procs.get_mut(&tunnel_id) {
            match child.try_wait() {
                Ok(Some(_)) => {
                    procs.remove(&tunnel_id);
                    let _ = crate::commands::process_persistence::remove_running_tunnel(
                        &app_handle, tunnel_id,
                    );
                    Some(false)
                }
                Ok(None) => Some(true),
                Err(_) => {
                    procs.remove(&tunnel_id);
                    let _ = crate::commands::process_persistence::remove_running_tunnel(
                        &app_handle, tunnel_id,
                    );
                    Some(false)
                }
            }
        } else {
            None
        }
    };

    if let Some(running) = in_process_manager {
        return Ok(running);
    }

    // 不在进程管理器中，检查持久化的 PID
    crate::commands::process_persistence::is_tunnel_process_alive(
        app_handle, tunnel_id, processes,
    )
    .await
}

#[tauri::command]
pub async fn get_running_tunnels(
    app_handle: tauri::AppHandle,
    processes: State<'_, FrpcProcesses>,
) -> Result<Vec<i32>, String> {
    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    let mut running_tunnels = Vec::new();
    let mut stopped_tunnels = Vec::new();

    for (tunnel_id, child) in procs.iter_mut() {
        match child.try_wait() {
            Ok(None) => running_tunnels.push(*tunnel_id),
            _ => stopped_tunnels.push(*tunnel_id),
        }
    }

    for tunnel_id in &stopped_tunnels {
        procs.remove(tunnel_id);
        let _ = crate::commands::process_persistence::remove_running_tunnel(
            &app_handle, *tunnel_id,
        );
    }

    // 也检查持久化的 PID（可能是上次运行遗留的孤儿进程）
    let persisted = crate::commands::process_persistence::recover_running_tunnels(&app_handle);
    for info in persisted {
        if !running_tunnels.contains(&info.tunnel_id) {
            running_tunnels.push(info.tunnel_id);
        }
    }

    Ok(running_tunnels)
}

#[tauri::command]
pub async fn fix_frpc_ini_tls(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let config_path = app_dir.join("frpc.ini");

    if !config_path.exists() {
        return Err("frpc.ini 文件不存在".to_string());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;

    let modified_content = content.replace("tls_enable = false", "tls_enable = true");

    if modified_content == content {
        return Err("配置文件中未找到 tls_enable = false".to_string());
    }

    std::fs::write(&config_path, modified_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    Ok("已成功将 tls_enable 设置为 true".to_string())
}

#[tauri::command]
pub async fn resolve_domain_to_ip(domain: String) -> Result<Option<String>, String> {
    use std::net::ToSocketAddrs;

    let addr_str = format!("{}:0", domain);
    Ok(addr_str
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| addrs.next())
        .map(|addr| addr.ip().to_string()))
}

fn generate_frpc_config(config: &TunnelConfig) -> Result<String, String> {
    let mut content = String::new();

    writeln!(content, "[common]").unwrap();
    writeln!(content, "server_addr = {}", config.server_addr).unwrap();
    writeln!(content, "server_port = {}", config.server_port).unwrap();

    if let Some(ref proxy_url) = config.http_proxy {
        writeln!(content, "http_proxy = {}", proxy_url).unwrap();
    }

    writeln!(content, "log_level = {}", config.log_level).unwrap();
    writeln!(content, "tls_enable = {}", config.force_tls).unwrap();
    writeln!(content, "tcp_mux = true").unwrap();
    writeln!(content, "pool_count = 5").unwrap();

    if config.kcp_optimization && (config.tunnel_type == "tcp" || config.tunnel_type == "udp") {
        writeln!(content, "protocol = kcp").unwrap();
    }

    writeln!(content, "user = {}", config.user_token).unwrap();
    writeln!(content, "token = {}", config.node_token).unwrap();
    writeln!(content).unwrap();

    writeln!(content, "[{}]", config.tunnel_name).unwrap();
    writeln!(content, "type = {}", config.tunnel_type).unwrap();
    writeln!(content, "local_ip = {}", config.local_ip).unwrap();
    writeln!(content, "local_port = {}", config.local_port).unwrap();

    match config.tunnel_type.as_str() {
        "tcp" | "udp" => {
            if let Some(remote_port) = config.remote_port {
                writeln!(content, "remote_port = {}", remote_port).unwrap();
            } else {
                return Err("TCP/UDP 隧道缺少 remote_port 参数".to_string());
            }
        }
        "http" | "https" => {
            if let Some(ref custom_domains) = config.custom_domains {
                writeln!(content, "custom_domains = {}", custom_domains).unwrap();
            } else {
                return Err("HTTP/HTTPS 隧道缺少 custom_domains 参数".to_string());
            }
        }
        _ => {
            return Err(format!("不支持的隧道类型: {}", config.tunnel_type));
        }
    }

    if config.encryption {
        writeln!(content, "use_encryption = true").unwrap();
    }

    if config.compression {
        writeln!(content, "use_compression = true").unwrap();
    }

    if let Some(ref extra_params) = config.extra_params {
        let normalized = extra_params.replace("\\r\\n", "\n").replace("\\n", "\n");
        // 额外参数只能写进当前隧道（proxy）段；遇到其它 section 头时，
        // 连同该 section 下的键值一起丢弃，避免参数被并入错误的 section
        let mut skipping_section = false;
        for line in normalized.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed.starts_with('[') {
                skipping_section = true;
                continue;
            }
            if skipping_section {
                continue;
            }
            writeln!(content, "{}", trimmed).unwrap();
        }
    }

    Ok(content)
}
