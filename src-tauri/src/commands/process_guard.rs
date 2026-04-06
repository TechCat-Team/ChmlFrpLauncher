use crate::models::{FrpcProcesses, LogMessage, ProcessGuardInfo, ProcessGuardState, TunnelConfig, TunnelType};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, State};

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
    "ChmlFrp API Error"
];

fn get_timestamp() -> String {
    chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string()
}

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

    Ok(format!(
        "守护进程已{}",
        if enabled { "启用" } else { "禁用" }
    ))
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
    config: TunnelConfig,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<(), String> {
    if !guard_state.enabled.load(Ordering::SeqCst) {
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
            tunnel_type: TunnelType::Api { config },
        },
    );

    if let Ok(mut stopped) = guard_state.manually_stopped.lock() {
        stopped.remove(&tunnel_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn add_guarded_custom_tunnel(
    tunnel_id_hash: i32,
    original_id: String,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<(), String> {
    if !guard_state.enabled.load(Ordering::SeqCst) {
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
            tunnel_type: TunnelType::Custom { original_id },
        },
    );

    if let Ok(mut stopped) = guard_state.manually_stopped.lock() {
        stopped.remove(&tunnel_id_hash);
    }

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

    Ok(())
}

pub fn should_stop_guard_by_log(message: &str) -> Option<&'static str> {
    let message_lower = message.to_lowercase();
    STOP_GUARD_PATTERNS
        .iter()
        .find(|p| message_lower.contains(&p.to_lowercase()))
        .copied()
}

#[tauri::command]
pub async fn check_log_and_stop_guard(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    log_message: String,
    guard_state: State<'_, ProcessGuardState>,
) -> Result<(), String> {
    let Some(pattern) = should_stop_guard_by_log(&log_message) else {
        return Ok(());
    };

    eprintln!("[守护进程] 检测到隧道 {} 出现错误: {}", tunnel_id, pattern);
    eprintln!("[守护进程] 停止对隧道 {} 的守护", tunnel_id);

    {
        let mut guarded = guard_state
            .guarded_processes
            .lock()
            .map_err(|e| format!("获取守护进程锁失败: {}", e))?;
        guarded.remove(&tunnel_id);
    }

    let _ = app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id,
            message: format!("[W] [ChmlFrpLauncher] 检测到错误 \"{}\"，已停止守护进程", pattern),
            timestamp: get_timestamp(),
        },
    );

    Ok(())
}

fn is_tunnel_running(processes: &State<'_, FrpcProcesses>, tunnel_id: i32) -> bool {
    let Ok(mut procs) = processes.processes.lock() else {
        return false;
    };

    let Some(child) = procs.get_mut(&tunnel_id) else {
        return false;
    };

    match child.try_wait() {
        Ok(None) => true,
        Ok(Some(_)) | Err(_) => {
            procs.remove(&tunnel_id);
            false
        }
    }
}

fn is_manually_stopped(guard_state: &State<'_, ProcessGuardState>, tunnel_id: i32) -> bool {
    guard_state
        .manually_stopped
        .lock()
        .ok()
        .map(|s| s.contains(&tunnel_id))
        .unwrap_or(true)
}

fn restart_tunnel(app_handle: tauri::AppHandle, info: ProcessGuardInfo) {
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(1));

        let processes_state = app_handle.state::<FrpcProcesses>();
        let guard_state_state = app_handle.state::<ProcessGuardState>();
        let tunnel_id = info.tunnel_id;

        let result = match info.tunnel_type {
            TunnelType::Api { config } => {
                tauri::async_runtime::block_on(async {
                    crate::commands::process::start_frpc(
                        app_handle.clone(),
                        config,
                        processes_state,
                        guard_state_state,
                    )
                    .await
                })
            }
            TunnelType::Custom { original_id } => {
                tauri::async_runtime::block_on(async {
                    crate::commands::custom_tunnel::start_custom_tunnel(
                        app_handle.clone(),
                        original_id,
                        processes_state,
                        guard_state_state,
                    )
                    .await
                })
            }
        };

        match result {
            Ok(_) => {
                let _ = app_handle.emit(
                    "tunnel-auto-restarted",
                    serde_json::json!({
                        "tunnel_id": tunnel_id,
                        "timestamp": get_timestamp(),
                    }),
                );
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "frpc-log",
                    LogMessage {
                        tunnel_id,
                        message: format!("[E] [ChmlFrpLauncher] 守护进程重启失败: {}", e),
                        timestamp: get_timestamp(),
                    },
                );

                if let Ok(mut guarded) = app_handle.state::<ProcessGuardState>().guarded_processes.lock() {
                    guarded.remove(&tunnel_id);
                }
            }
        }
    });
}

pub fn start_guard_monitor(app_handle: tauri::AppHandle) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(3));

            let guard_state = app_handle.state::<ProcessGuardState>();
            let processes = app_handle.state::<FrpcProcesses>();

            if !guard_state.enabled.load(Ordering::SeqCst) {
                continue;
            }

            let guarded_list: Vec<ProcessGuardInfo> = match guard_state.guarded_processes.lock() {
                Ok(guarded) => guarded.values().cloned().collect(),
                Err(_) => continue,
            };

            if guarded_list.is_empty() {
                continue;
            }

            for info in guarded_list {
                let tunnel_id = info.tunnel_id;

                if is_manually_stopped(&guard_state, tunnel_id) {
                    continue;
                }

                if is_tunnel_running(&processes, tunnel_id) {
                    continue;
                }

                let _ = app_handle.emit(
                    "frpc-log",
                    LogMessage {
                        tunnel_id,
                        message: "[W] [ChmlFrpLauncher] 检测到进程离线，触发守护进程，自动重启中".to_string(),
                        timestamp: get_timestamp(),
                    },
                );

                restart_tunnel(app_handle.clone(), info);
            }
        }
    });
}
