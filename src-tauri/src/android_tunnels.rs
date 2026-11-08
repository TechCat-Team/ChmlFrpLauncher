use super::android_service;
use crate::{frpc_config::generate_frpc_config, models::TunnelConfig};
use std::{
    ffi::{CStr, CString},
    os::raw::{c_char, c_int},
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};
use tauri::{Emitter, Manager};

#[link(name = "chmlfrpc")]
extern "C" {
    fn ChmlStart(id: c_int, config: *const c_char) -> *mut c_char;
    fn ChmlStop(id: c_int) -> *mut c_char;
    fn ChmlRunning(id: c_int) -> c_int;
    fn ChmlStatus(id: c_int) -> *mut c_char;
    fn ChmlLogs(after: i64) -> *mut c_char;
    fn ChmlRunningIDs() -> *mut c_char;
}

/// 读取并释放 Go 返回的 C 字符串
fn take_string(ptr: *mut c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let value = unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() };
    unsafe { libc::free(ptr.cast()) };
    Some(value)
}

fn take_error(ptr: *mut c_char) -> Result<(), String> {
    match take_string(ptr) {
        Some(message) => Err(message),
        None => Ok(()),
    }
}

/// 以 Go 核心为准获取运行中的隧道。Activity 重建后 Rust 侧状态可能丢失，但 Go 中的隧道仍在运行
fn running_ids() -> Vec<i32> {
    take_string(unsafe { ChmlRunningIDs() })
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

/// 上次通知前台服务的隧道数量；usize::MAX 表示尚未同步
static SYNCED_COUNT: AtomicUsize = AtomicUsize::new(usize::MAX);

/// 隧道数量变化时启动、刷新或停止前台服务
fn sync_service() {
    let count = running_ids().len();
    if SYNCED_COUNT.swap(count, Ordering::SeqCst) != count {
        android_service::update_tunnels(count as i32);
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct LogMessage {
    tunnel_id: i32,
    message: String,
    timestamp: String,
}

#[derive(serde::Deserialize)]
struct LogBatch {
    next: i64,
    lines: Vec<LogMessage>,
}

static PUMP_STARTED: AtomicBool = AtomicBool::new(false);

/// 定期读取 FRP 核心的内存日志，并以与桌面端相同的 `frpc-log` 事件发送给前端；
/// 同时检测隧道异常退出，及时更新前台服务。整个进程只启动一次
pub fn start_log_pump(app: tauri::AppHandle) {
    if PUMP_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let mut after = 0i64;
        let mut tick = 0u32;
        loop {
            if let Some(json) = take_string(unsafe { ChmlLogs(after) }) {
                if let Ok(batch) = serde_json::from_str::<LogBatch>(&json) {
                    after = batch.next;
                    for line in batch.lines {
                        let _ = app.emit("frpc-log", line);
                    }
                }
            }
            tick = tick.wrapping_add(1);
            if tick % 3 == 0 {
                sync_service();
            }
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    });
}

#[tauri::command]
pub async fn start_frpc(app: tauri::AppHandle, config: TunnelConfig) -> Result<String, String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let content = generate_frpc_config(&config)?;
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("frpc-{}.ini", config.tunnel_id));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    drop(file);
    let path_arg = CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    let result = take_error(unsafe { ChmlStart(config.tunnel_id, path_arg.as_ptr()) });
    let _ = std::fs::remove_file(path);
    result?;
    // 用户在前台启动隧道时立即启动前台服务（Android 12+ 不允许从后台启动）
    sync_service();
    Ok("隧道正在连接".into())
}

#[tauri::command]
pub async fn stop_frpc(tunnel_id: i32) -> Result<String, String> {
    let result = take_error(unsafe { ChmlStop(tunnel_id) });
    sync_service();
    result?;
    Ok("隧道已停止".into())
}

#[tauri::command]
pub fn is_frpc_running(tunnel_id: i32) -> bool {
    unsafe { ChmlRunning(tunnel_id) != 0 }
}

#[tauri::command]
pub fn get_running_tunnels() -> Vec<i32> {
    running_ids()
}

#[tauri::command]
pub fn get_frpc_status(tunnel_id: i32) -> Result<serde_json::Value, String> {
    let json = take_string(unsafe { ChmlStatus(tunnel_id) }).ok_or("无法获取隧道状态")?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct PortCheckResult {
    occupied: bool,
    pid: Option<String>,
    process: Option<String>,
}

#[tauri::command]
pub fn check_local_port(port: String) -> Result<PortCheckResult, String> {
    let port: u16 = port.parse().map_err(|_| "无效端口".to_string())?;
    if port == 0 {
        return Err("无效端口".into());
    }
    let occupied = match std::net::TcpListener::bind((std::net::Ipv4Addr::UNSPECIFIED, port)) {
        Ok(_) => false,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => true,
        Err(e) => return Err(format!("检查端口失败: {e}")),
    };
    Ok(PortCheckResult {
        occupied,
        pid: None,
        process: None,
    })
}
