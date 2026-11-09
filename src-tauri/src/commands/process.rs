use crate::models::{FrpcProcesses, LogMessage, ProcessGuardState, TunnelConfig};
use crate::frpc_config::{api_config_file_name, generate_frpc_config, legacy_api_config_file_name};
use crate::utils::{spawn_frpc_worker, sanitize_log};
use std::io::{BufRead, BufReader};
use std::thread;
use tauri::{Emitter, Manager, State};

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

    let (pid, stdout, stderr) = {
        let mut procs = super::process_persistence::lock_for_start(&app_handle, &processes, tunnel_id)?;
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&app_dir).map_err(|e| format!("创建应用目录失败: {}", e))?;

        let config_path = app_dir.join(api_config_file_name(tunnel_id));
        let config_content = generate_frpc_config(&config)?;
        // 清理升级前生成的 INI 配置
        let _ = std::fs::remove_file(app_dir.join(legacy_api_config_file_name(tunnel_id)));

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

        let mut child = spawn_frpc_worker(&app_dir, &config_path)?;
        let pid = child.id();

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        if let Err(error) = crate::commands::process_persistence::save_running_tunnel(
            &app_handle, tunnel_id, pid, "api", None,
        ) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        procs.insert(tunnel_id, child);
        (pid, stdout, stderr)
    };

    let _ = crate::commands::process_guard::add_guarded_process(tunnel_id, config, guard_state)
        .await;

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

    if let Some(stdout) = stdout {
        spawn_log_reader(
            app_handle.clone(),
            tunnel_id,
            user_token.clone(),
            node_token.clone(),
            stdout,
            false,
        );
    }

    if let Some(stderr) = stderr {
        spawn_log_reader(
            app_handle.clone(),
            tunnel_id,
            user_token,
            node_token,
            stderr,
            true,
        );
    }

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

    super::process_persistence::stop_tunnel_process(&app_handle, tunnel_id, &processes, true)?;
    Ok("frpc 已停止".to_string())
}

#[tauri::command]
pub async fn is_frpc_running(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    super::process_persistence::is_tunnel_process_alive(app_handle, tunnel_id, processes).await
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
    let persisted = super::process_persistence::read_running_tunnels(&app_handle)?;
    for info in persisted {
        if !running_tunnels.contains(&info.tunnel_id) {
            running_tunnels.push(info.tunnel_id);
        }
    }

    Ok(running_tunnels)
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

