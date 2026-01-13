use crate::models::{FrpcProcesses, LogMessage, ProcessGuardInfo, ProcessGuardState, TunnelType};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, State};

/// 停止守护的错误模式配置
const STOP_GUARD_PATTERNS: &[&str] = &[
    "token in login doesn't match token from configuration",
    "authorization failed",
    "invalid token",
    "read: connection reset by peer",
    "错误的用户token，此用户不存在",
    "允许的隧道数量超出上限，请删除隧道或续费vip",
    "不属于你",
    "缺少用户token或隧道id参数",
    "您目前为免费会员",
    "客户端代理参数错误，配置文件与记录不匹配。请不要随意修改配置文件！",
];

#[tauri::command]
pub async fn set_process_guard_enabled(
    enabled: bool,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<String, String> {
    guard_state.enabled.store(enabled, Ordering::SeqCst);
    
    if !enabled {
        if let Ok(mut guarded) = guard_state.guarded_processes.lock() {
            guarded.clear();
        }
        if let Ok(mut stopped) = guard_state.manually_stopped.lock() {
            stopped.clear();
        }
    }
    
    Ok(format!("守护进程已{}", if enabled { "启用" } else { "禁用" }))
}

#[tauri::command]
pub async fn get_process_guard_enabled(
    guard_state: State<'_, ProcessGuardState>,
) -> Result<bool, String> {
    Ok(guard_state.enabled.load(Ordering::SeqCst))
}

#[tauri::command]
pub async fn add_guarded_process(
    tunnel_id: i32,
    user_token: String,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<(), String> {
    let is_enabled = guard_state.enabled.load(Ordering::SeqCst);
    eprintln!("[守护进程] 尝试添加API隧道 {} 到守护列表, 守护进程状态: {}", 
        tunnel_id, 
        if is_enabled { "启用" } else { "禁用" }
    );
    
    if !is_enabled {
        eprintln!("[守护进程] 守护进程未启用，不添加隧道 {}", tunnel_id);
        return Ok(());
    }
    
    let mut guarded = guard_state
        .guarded_processes
        .lock()
        .map_err(|e| format!("获取守护进程锁失败: {}", e))?;
    
    guarded.insert(
        tunnel_id,
        ProcessGuardInfo {
            tunnel_id,
            tunnel_type: TunnelType::Api { user_token },
        },
    );
    
    if let Ok(mut stopped) = guard_state.manually_stopped.lock() {
        stopped.remove(&tunnel_id);
    }
    
    eprintln!("[守护进程] 成功添加API隧道 {} 到守护列表，当前守护 {} 个隧道", tunnel_id, guarded.len());
    Ok(())
}

#[tauri::command]
pub async fn add_guarded_custom_tunnel(
    tunnel_id_hash: i32,
    original_id: String,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<(), String> {
    let is_enabled = guard_state.enabled.load(Ordering::SeqCst);
    eprintln!("[守护进程] 尝试添加自定义隧道 {} (hash: {}) 到守护列表, 守护进程状态: {}", 
        original_id,
        tunnel_id_hash,
        if is_enabled { "启用" } else { "禁用" }
    );
    
    if !is_enabled {
        eprintln!("[守护进程] 守护进程未启用，不添加隧道 {}", original_id);
        return Ok(());
    }
    
    let mut guarded = guard_state
        .guarded_processes
        .lock()
        .map_err(|e| format!("获取守护进程锁失败: {}", e))?;
    
    guarded.insert(
        tunnel_id_hash,
        ProcessGuardInfo {
            tunnel_id: tunnel_id_hash,
            tunnel_type: TunnelType::Custom { original_id: original_id.clone() },
        },
    );
    
    if let Ok(mut stopped) = guard_state.manually_stopped.lock() {
        stopped.remove(&tunnel_id_hash);
    }
    
    eprintln!("[守护进程] 成功添加自定义隧道 {} 到守护列表，当前守护 {} 个隧道", original_id, guarded.len());
    Ok(())
}

#[tauri::command]
pub async fn remove_guarded_process(
    tunnel_id: i32,
    guard_state: State<'_, ProcessGuardState>,
    is_manual_stop: bool,
) -> Result<(), String> {
    let mut guarded = guard_state
        .guarded_processes
        .lock()
        .map_err(|e| format!("获取守护进程锁失败: {}", e))?;
    
    guarded.remove(&tunnel_id);
    
    if is_manual_stop {
        if let Ok(mut stopped) = guard_state.manually_stopped.lock() {
            stopped.insert(tunnel_id);
        }
    }
    
    eprintln!("[守护进程] 从守护列表移除隧道 {}", tunnel_id);
    Ok(())
}

/// 检查日志消息是否包含需要停止守护的错误模式
pub fn should_stop_guard_by_log(message: &str) -> Option<&'static str> {
    for pattern in STOP_GUARD_PATTERNS {
        if message.to_lowercase().contains(&pattern.to_lowercase()) {
            return Some(pattern);
        }
    }
    None
}

/// 处理日志并检查是否需要停止守护
#[tauri::command]
pub async fn check_log_and_stop_guard(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    log_message: String,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<(), String> {
    if let Some(pattern) = should_stop_guard_by_log(&log_message) {
        eprintln!("[守护进程] 检测到隧道 {} 出现错误: {}", tunnel_id, pattern);
        eprintln!("[守护进程] 停止对隧道 {} 的守护", tunnel_id);
        
        // 从守护列表中移除（不标记为手动停止，因为这是自动停止）
        let mut guarded = guard_state
            .guarded_processes
            .lock()
            .map_err(|e| format!("获取守护进程锁失败: {}", e))?;
        
        guarded.remove(&tunnel_id);
        
        // 发送日志消息通知用户
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        let _ = app_handle.emit(
            "frpc-log",
            LogMessage {
                tunnel_id,
                message: format!("检测到错误 \"{}\"，已停止守护进程", pattern),
                timestamp,
            },
        );
    }
    
    Ok(())
}

pub fn start_guard_monitor(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        eprintln!("[守护进程] 监控线程已启动");
        let mut last_log_time = std::time::Instant::now();
        
        loop {
            thread::sleep(Duration::from_secs(3));
            
            let guard_state = app_handle.state::<ProcessGuardState>();
            let processes = app_handle.state::<FrpcProcesses>();
            
            let is_enabled = guard_state.enabled.load(Ordering::SeqCst);
            
            if last_log_time.elapsed().as_secs() >= 30 {
                eprintln!("[守护进程] 状态: {}", if is_enabled { "启用" } else { "禁用" });
                last_log_time = std::time::Instant::now();
            }
            
            if !is_enabled {
                continue;
            }
            
            let guarded_list: Vec<ProcessGuardInfo> = {
                match guard_state.guarded_processes.lock() {
                    Ok(guarded) => {
                        let list: Vec<_> = guarded.values().cloned().collect();
                        if !list.is_empty() {
                            eprintln!("[守护进程] 正在监控 {} 个隧道", list.len());
                        }
                        list
                    },
                    Err(_) => continue,
                }
            };
            
            if guarded_list.is_empty() {
                continue;
            }
            
            for info in guarded_list {
                let tunnel_id = info.tunnel_id;
                
                let is_manually_stopped = {
                    match guard_state.manually_stopped.lock() {
                        Ok(stopped) => stopped.contains(&tunnel_id),
                        Err(_) => continue,
                    }
                };
                
                if is_manually_stopped {
                    continue;
                }
                
                let is_running = {
                    match processes.processes.lock() {
                        Ok(mut procs) => {
                            if let Some(child) = procs.get_mut(&tunnel_id) {
                                match child.try_wait() {
                                    Ok(Some(_)) => {
                                        procs.remove(&tunnel_id);
                                        false
                                    }
                                    Ok(None) => true,
                                    Err(_) => {
                                        procs.remove(&tunnel_id);
                                        false
                                    }
                                }
                            } else {
                                false
                            }
                        }
                        Err(_) => continue,
                    }
                };
                
                if !is_running {
                    eprintln!("[守护进程] 检测到隧道 {} 进程离线，准备自动重启", tunnel_id);
                    
                    let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
                    let _ = app_handle.emit(
                        "frpc-log",
                        LogMessage {
                            tunnel_id,
                            message: "检测到进程离线，触发守护进程，自动重启中".to_string(),
                            timestamp,
                        },
                    );
                    
                    let app_clone = app_handle.clone();
                    let tunnel_type = info.tunnel_type.clone();
                    
                    thread::spawn(move || {
                        eprintln!("[守护进程] 开始重启隧道 {}", tunnel_id);
                        
                        thread::sleep(Duration::from_secs(1));
                        
                        let processes_state = app_clone.state::<FrpcProcesses>();
                        let guard_state_state = app_clone.state::<ProcessGuardState>();
                        
                        let result = match tunnel_type {
                            TunnelType::Api { user_token } => {
                                eprintln!("[守护进程] 重启API隧道 {}", tunnel_id);
                                tauri::async_runtime::block_on(async {
                                    crate::commands::process::start_frpc(
                                        app_clone.clone(),
                                        tunnel_id,
                                        user_token.clone(),
                                        processes_state,
                                        guard_state_state,
                                    )
                                    .await
                                })
                            }
                            TunnelType::Custom { original_id } => {
                                eprintln!("[守护进程] 重启自定义隧道 {} (原始ID: {})", tunnel_id, original_id);
                                tauri::async_runtime::block_on(async {
                                    crate::commands::custom_tunnel::start_custom_tunnel(
                                        app_clone.clone(),
                                        original_id.clone(),
                                        processes_state,
                                        guard_state_state,
                                    )
                                    .await
                                })
                            }
                        };
                        
                        match result {
                            Ok(_) => {
                                eprintln!("[守护进程] 隧道 {} 重启成功", tunnel_id);
                                
                                let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
                                let _ = app_clone.emit(
                                    "tunnel-auto-restarted",
                                    serde_json::json!({
                                        "tunnel_id": tunnel_id,
                                        "timestamp": timestamp,
                                    }),
                                );
                            }
                            Err(e) => {
                                eprintln!("[守护进程] 隧道 {} 重启失败: {}", tunnel_id, e);
                                let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
                                let _ = app_clone.emit(
                                    "frpc-log",
                                    LogMessage {
                                        tunnel_id,
                                        message: format!("守护进程重启失败: {}", e),
                                        timestamp,
                                    },
                                );
                                
                                let guard_state_final = app_clone.state::<ProcessGuardState>();
                                if let Ok(mut guarded) = guard_state_final.guarded_processes.lock() {
                                    guarded.remove(&tunnel_id);
                                };
                            }
                        }
                    });
                }
            }
        }
    });
}

