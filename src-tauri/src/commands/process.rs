use crate::models::{FrpcProcesses, LogMessage};
use crate::utils::sanitize_log;
use std::fs;
use std::io::{BufRead, BufReader};
use std::process::{Command as StdCommand, Stdio};
use std::thread;
use tauri::{Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
pub async fn start_frpc(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    user_token: String,
    processes: State<'_, FrpcProcesses>,
) -> Result<String, String> {
    eprintln!("========================================");
    eprintln!("[隧道 {}] 开始启动 frpc", tunnel_id);

    {
        let procs = processes.processes.lock().map_err(|e| {
            eprintln!("[隧道 {}] 获取进程锁失败: {}", tunnel_id, e);
            format!("获取进程锁失败: {}", e)
        })?;
        if procs.contains_key(&tunnel_id) {
            eprintln!("[隧道 {}] 该隧道已在运行中", tunnel_id);
            return Err("该隧道已在运行中".to_string());
        }
        eprintln!("[隧道 {}] 当前管理的进程数: {}", tunnel_id, procs.len());
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

    eprintln!("[隧道 {}] frpc 路径: {:?}", tunnel_id, frpc_path);

    if !frpc_path.exists() {
        eprintln!("[隧道 {}] frpc 文件不存在", tunnel_id);
        return Err("frpc 未找到，请先下载".to_string());
    }

    // Unix系统上确保有执行权限
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(&frpc_path).map_err(|e| e.to_string())?;
        let mut perms = metadata.permissions();
        if perms.mode() & 0o111 == 0 {
            eprintln!("[隧道 {}] 设置执行权限", tunnel_id);
            perms.set_mode(0o755);
            fs::set_permissions(&frpc_path, perms).map_err(|e| e.to_string())?;
        }
    }

    // 启动 frpc 进程，设置工作目录为应用数据目录
    eprintln!("[隧道 {}] 准备启动进程...", tunnel_id);
    eprintln!("[隧道 {}] 工作目录: {:?}", tunnel_id, app_dir);
    let mut cmd = StdCommand::new(&frpc_path);
    cmd.current_dir(&app_dir) // 没有这个会在src-tauri目录生成frpc.ini文件
        .arg("-u")
        .arg(&user_token)
        .arg("-p")
        .arg(tunnel_id.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    // Windows上隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }
    
    let mut child = cmd.spawn()
        .map_err(|e| {
            eprintln!("[隧道 {}] 启动进程失败: {}", tunnel_id, e);
            format!("启动 frpc 失败: {}", e)
        })?;

    let pid = child.id();
    eprintln!("[隧道 {}] 进程已启动，PID: {}", tunnel_id, pid);

    // 发送启动日志（不包含敏感信息）
    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
    eprintln!("[隧道 {}] 发送启动日志事件", tunnel_id);
    match app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id,
            message: format!("frpc 进程已启动 (PID: {}), 开始连接服务器...", pid),
            timestamp: timestamp.clone(),
        },
    ) {
        Ok(_) => eprintln!("[隧道 {}] 启动日志事件已发送", tunnel_id),
        Err(e) => eprintln!("[隧道 {}] 发送启动日志事件失败: {}", tunnel_id, e),
    }

    // 捕获 stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id;
        let user_token_clone = user_token.clone();
        match thread::Builder::new()
            .name(format!("frpc-stdout-{}", tunnel_id))
            .spawn(move || {
                eprintln!("[线程 stdout-{}] 开始监听", tunnel_id_clone);
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    // 去除 ANSI 颜色代码
                    let clean_line = strip_ansi_escapes::strip_str(&line);

                    // 隐藏用户 token
                    let sanitized_line = sanitize_log(&clean_line, &user_token_clone);

                    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
                    if let Err(e) = app_handle_clone.emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id: tunnel_id_clone,
                            message: sanitized_line,
                            timestamp,
                        },
                    ) {
                        eprintln!("[线程 stdout-{}] 发送日志事件失败: {}", tunnel_id_clone, e);
                        break; // 如果事件发送失败，停止监听
                    }
                }
                eprintln!("[线程 stdout-{}] 结束监听", tunnel_id_clone);
            }) {
            Ok(_) => eprintln!("[隧道 {}] stdout 监听线程已启动", tunnel_id),
            Err(e) => eprintln!("[隧道 {}] 创建 stdout 监听线程失败: {}", tunnel_id, e),
        }
    }

    // 捕获 stderr
    if let Some(stderr) = child.stderr.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id;
        let user_token_clone = user_token.clone();
        match thread::Builder::new()
            .name(format!("frpc-stderr-{}", tunnel_id))
            .spawn(move || {
                eprintln!("[线程 stderr-{}] 开始监听", tunnel_id_clone);
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    // 去除 ANSI 颜色代码
                    let clean_line = strip_ansi_escapes::strip_str(&line);

                    // 隐藏用户 token
                    let sanitized_line = sanitize_log(&clean_line, &user_token_clone);

                    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
                    if let Err(e) = app_handle_clone.emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id: tunnel_id_clone,
                            message: format!("[ERR] {}", sanitized_line),
                            timestamp,
                        },
                    ) {
                        eprintln!("[线程 stderr-{}] 发送日志事件失败: {}", tunnel_id_clone, e);
                        break;
                    }
                }
                eprintln!("[线程 stderr-{}] 结束监听", tunnel_id_clone);
            }) {
            Ok(_) => eprintln!("[隧道 {}] stderr 监听线程已启动", tunnel_id),
            Err(e) => eprintln!("[隧道 {}] 创建 stderr 监听线程失败: {}", tunnel_id, e),
        }
    }

    {
        let mut procs = processes
            .processes
            .lock()
            .map_err(|e| format!("获取进程锁失败: {}", e))?;
        eprintln!("[隧道 {}] 将进程 PID {} 存储到管理器", tunnel_id, pid);
        procs.insert(tunnel_id, child);
        eprintln!(
            "[隧道 {}] 进程存储成功，当前管理的进程数: {}",
            tunnel_id,
            procs.len()
        );
    }

    eprintln!("[隧道 {}] frpc 启动完成", tunnel_id);
    Ok(format!("frpc 已启动 (PID: {})", pid))
}

#[tauri::command]
pub async fn stop_frpc(tunnel_id: i32, processes: State<'_, FrpcProcesses>) -> Result<String, String> {
    eprintln!("[隧道 {}] 请求停止进程", tunnel_id);

    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    if let Some(mut child) = procs.remove(&tunnel_id) {
        eprintln!("[隧道 {}] 找到进程，准备停止", tunnel_id);
        match child.kill() {
            Ok(_) => {
                eprintln!("[隧道 {}] kill 信号已发送", tunnel_id);
                match child.wait() {
                    Ok(status) => {
                        eprintln!("[隧道 {}] 进程已退出，状态: {:?}", tunnel_id, status);
                        Ok("frpc 已停止".to_string())
                    }
                    Err(e) => {
                        eprintln!("[隧道 {}] 等待进程退出失败: {}", tunnel_id, e);
                        Ok("frpc 已停止".to_string())
                    }
                }
            }
            Err(e) => {
                eprintln!("[隧道 {}] kill 失败: {}", tunnel_id, e);
                // 即使 kill 失败，也尝试等待进程
                let _ = child.wait();
                Err(format!("停止进程失败: {}", e))
            }
        }
    } else {
        eprintln!("[隧道 {}] 进程未找到", tunnel_id);
        Err("该隧道未在运行".to_string())
    }
}

#[tauri::command]
pub async fn is_frpc_running(
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    let mut procs = processes.processes.lock().map_err(|e| {
        eprintln!("[隧道 {}] 检查状态时获取锁失败: {}", tunnel_id, e);
        format!("获取进程锁失败: {}", e)
    })?;

    if let Some(child) = procs.get_mut(&tunnel_id) {
        match child.try_wait() {
            Ok(Some(status)) => {
                eprintln!("[隧道 {}] 进程已退出，状态: {:?}", tunnel_id, status);
                procs.remove(&tunnel_id);
                Ok(false)
            }
            Ok(None) => {
                Ok(true)
            }
            Err(e) => {
                eprintln!("[隧道 {}] 检查进程状态失败: {}", tunnel_id, e);
                procs.remove(&tunnel_id);
                Ok(false)
            }
        }
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn test_log_event(app_handle: tauri::AppHandle, tunnel_id: i32) -> Result<String, String> {
    eprintln!("[测试] 发送测试日志事件");
    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();

    match app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id,
            message: "这是一条测试日志".to_string(),
            timestamp,
        },
    ) {
        Ok(_) => {
            eprintln!("[测试] 测试日志事件发送成功");
            Ok("测试日志已发送".to_string())
        }
        Err(e) => {
            eprintln!("[测试] 测试日志事件发送失败: {}", e);
            Err(format!("发送失败: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_running_tunnels(processes: State<'_, FrpcProcesses>) -> Result<Vec<i32>, String> {
    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    let mut running_tunnels = Vec::new();
    let mut stopped_tunnels = Vec::new();

    for (tunnel_id, child) in procs.iter_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                stopped_tunnels.push(*tunnel_id);
            }
            Ok(None) => {
                running_tunnels.push(*tunnel_id);
            }
            Err(_) => {
                stopped_tunnels.push(*tunnel_id);
            }
        }
    }

    for tunnel_id in stopped_tunnels {
        procs.remove(&tunnel_id);
    }

    Ok(running_tunnels)
}

