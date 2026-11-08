use super::custom_tunnel::config_file_names;
use crate::frpc_config::{api_config_file_name, legacy_api_config_file_name};
use crate::{models::FrpcProcesses, FRPC_WORKER_ARG};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::{atomic::Ordering, MutexGuard};
use sysinfo::{
    Pid, Process, ProcessRefreshKind, ProcessStatus, ProcessesToUpdate, System, UpdateKind,
};
use tauri::{Manager, State};

const RUNNING_TUNNELS_FILE: &str = "running_tunnels.json";

/// 保存隧道进程信息
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PersistedTunnelInfo {
    pub tunnel_id: i32,
    pub pid: u32,
    pub tunnel_type: String,
    pub original_id: Option<String>,
    pub started_at: String,
}

fn get_persistence_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;
    Ok(app_dir.join(RUNNING_TUNNELS_FILE))
}

/// 保存运行中的隧道信息
pub fn save_running_tunnel(
    app_handle: &tauri::AppHandle,
    tunnel_id: i32,
    pid: u32,
    tunnel_type: &str,
    original_id: Option<String>,
) -> Result<(), String> {
    let path = get_persistence_path(app_handle)?;
    let mut tunnels = load_persisted_tunnels_from_file(&path);

    tunnels.insert(
        tunnel_id,
        PersistedTunnelInfo {
            tunnel_id,
            pid,
            tunnel_type: tunnel_type.to_string(),
            original_id,
            started_at: chrono::Local::now().to_rfc3339(),
        },
    );

    write_persisted_tunnels(&path, &tunnels)
}

/// 移除隧道信息
pub fn remove_running_tunnel(app_handle: &tauri::AppHandle, tunnel_id: i32) -> Result<(), String> {
    let path = get_persistence_path(app_handle)?;
    let mut tunnels = load_persisted_tunnels_from_file(&path);

    tunnels.remove(&tunnel_id);

    write_persisted_tunnels(&path, &tunnels)
}

/// 从磁盘读取隧道信息
fn load_persisted_tunnels_from_file(path: &Path) -> HashMap<i32, PersistedTunnelInfo> {
    if !path.exists() {
        return HashMap::new();
    }

    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_persisted_tunnels(
    path: &Path,
    tunnels: &HashMap<i32, PersistedTunnelInfo>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let content =
        serde_json::to_string_pretty(tunnels).map_err(|e| format!("序列化失败: {}", e))?;

    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, content).map_err(|e| format!("写入隧道记录失败: {e}"))?;
    std::fs::rename(&temporary, path).map_err(|e| format!("保存隧道记录失败: {e}"))
}

fn refresh_processes<'a>(tunnels: impl Iterator<Item = &'a PersistedTunnelInfo>) -> System {
    let pids: Vec<_> = tunnels.map(|info| Pid::from_u32(info.pid)).collect();
    let mut system = System::new();
    if !pids.is_empty() {
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&pids),
            true,
            ProcessRefreshKind::nothing()
                .with_cmd(UpdateKind::OnlyIfNotSet)
                .with_exe(UpdateKind::OnlyIfNotSet),
        );
    }
    system
}

fn find_tunnel_process<'a>(
    system: &'a System,
    app_dir: &Path,
    info: &PersistedTunnelInfo,
) -> Option<&'a Process> {
    if info.pid == std::process::id() {
        return None;
    }
    let process = system.process(Pid::from_u32(info.pid))?;
    if matches!(
        process.status(),
        ProcessStatus::Zombie | ProcessStatus::Dead
    ) {
        return None;
    }

    // 当前版本使用 TOML 配置；升级前启动的进程仍可能使用 INI 配置，两者都需要识别
    let file_names = match info.tunnel_type.as_str() {
        "api" => vec![
            api_config_file_name(info.tunnel_id),
            legacy_api_config_file_name(info.tunnel_id),
        ],
        "custom" => config_file_names(info.original_id.as_deref()?).to_vec(),
        _ => return None,
    };
    let [_, mode, path] = process.cmd() else {
        return None;
    };
    let matches_config = |allow_relative: bool| {
        file_names.iter().any(|name| {
            Path::new(path) == app_dir.join(name) || (allow_relative && path == OsStr::new(name))
        })
    };
    if mode == FRPC_WORKER_ARG && matches_config(false) {
        return Some(process);
    }

    // Recover a legacy child that was still running when the launcher was upgraded.
    let legacy_name = if cfg!(windows) { "frpc.exe" } else { "frpc" };
    let legacy_exe = process.exe().and_then(Path::file_name) == Some(OsStr::new(legacy_name));
    (legacy_exe && mode == "-c" && matches_config(true)).then_some(process)
}

fn running_tunnels(
    path: &Path,
    tunnels: HashMap<i32, PersistedTunnelInfo>,
) -> HashMap<i32, PersistedTunnelInfo> {
    let system = refresh_processes(tunnels.values());
    let app_dir = path.parent().expect("隧道记录应位于应用数据目录");
    tunnels
        .into_iter()
        .filter(|(_, info)| find_tunnel_process(&system, app_dir, info).is_some())
        .collect()
}

pub(super) fn lock_for_start<'a>(
    app_handle: &tauri::AppHandle,
    processes: &'a FrpcProcesses,
    tunnel_id: i32,
) -> Result<MutexGuard<'a, HashMap<i32, Child>>, String> {
    let mut children = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {e}"))?;
    if processes.update_installing.load(Ordering::SeqCst) {
        return Err("正在安装更新，暂时无法启动隧道".to_string());
    }
    if let Some(child) = children.get_mut(&tunnel_id) {
        if child
            .try_wait()
            .map_err(|e| format!("查询进程状态失败: {e}"))?
            .is_none()
        {
            return Err("该隧道已在运行中".to_string());
        }
        children.remove(&tunnel_id);
    }
    if persisted_tunnel_running(app_handle, tunnel_id)? {
        return Err("该隧道已在运行中".to_string());
    }
    Ok(children)
}

fn persisted_tunnel_running(app_handle: &tauri::AppHandle, tunnel_id: i32) -> Result<bool, String> {
    let path = get_persistence_path(app_handle)?;
    let tunnels = load_persisted_tunnels_from_file(&path);
    let Some(info) = tunnels.get(&tunnel_id) else {
        return Ok(false);
    };
    let system = refresh_processes(std::iter::once(info));
    let app_dir = path.parent().expect("隧道记录应位于应用数据目录");
    Ok(find_tunnel_process(&system, app_dir, info).is_some())
}

pub fn recover_running_tunnels(app_handle: &tauri::AppHandle) {
    if let Ok(path) = get_persistence_path(app_handle) {
        let tunnels = running_tunnels(&path, load_persisted_tunnels_from_file(&path));
        let _ = write_persisted_tunnels(&path, &tunnels);
    }
}

pub(super) fn read_running_tunnels(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<PersistedTunnelInfo>, String> {
    let path = get_persistence_path(app_handle)?;
    Ok(
        running_tunnels(&path, load_persisted_tunnels_from_file(&path))
            .into_values()
            .collect(),
    )
}

#[tauri::command]
pub async fn get_persisted_running_tunnels(
    app_handle: tauri::AppHandle,
) -> Result<Vec<PersistedTunnelInfo>, String> {
    read_running_tunnels(&app_handle)
}

#[tauri::command]
pub async fn stop_orphan_process(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
) -> Result<String, String> {
    if !stop_tunnel_process(&app_handle, tunnel_id, &processes, false)? {
        return Err("未找到该隧道的运行记录".to_string());
    }
    Ok("隧道已停止".to_string())
}

pub(super) fn stop_tunnel_process(
    app_handle: &tauri::AppHandle,
    tunnel_id: i32,
    processes: &FrpcProcesses,
    remove_generated_config: bool,
) -> Result<bool, String> {
    let mut children = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {e}"))?;
    let path = get_persistence_path(app_handle)?;
    let mut tunnels = load_persisted_tunnels_from_file(&path);
    let info = tunnels.remove(&tunnel_id);

    let found = if let Some(child) = children.get_mut(&tunnel_id) {
        stop_child(child)?;
        children.remove(&tunnel_id);
        true
    } else if let Some(ref info) = info {
        stop_recovered_tunnel(&path, &refresh_processes(std::iter::once(info)), info)?;
        true
    } else {
        false
    };

    if remove_generated_config {
        let _ = std::fs::remove_file(path.with_file_name(api_config_file_name(tunnel_id)));
        let _ = std::fs::remove_file(path.with_file_name(legacy_api_config_file_name(tunnel_id)));
    }
    if info.is_some() {
        write_persisted_tunnels(&path, &tunnels)?;
    }
    Ok(found)
}

fn stop_child(child: &mut Child) -> Result<(), String> {
    if child
        .try_wait()
        .map_err(|e| format!("查询进程状态失败: {e}"))?
        .is_none()
    {
        child.kill().map_err(|e| format!("终止进程失败: {e}"))?;
        child.wait().map_err(|e| format!("等待进程退出失败: {e}"))?;
    }
    Ok(())
}

fn stop_recovered_tunnel(
    path: &Path,
    system: &System,
    info: &PersistedTunnelInfo,
) -> Result<(), String> {
    let app_dir = path.parent().expect("隧道记录应位于应用数据目录");
    if let Some(process) = find_tunnel_process(system, app_dir, info) {
        process
            .kill_and_wait()
            .map_err(|e| format!("终止隧道进程 {} 失败: {e:?}", info.pid))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_update_installing(
    installing: bool,
    app_handle: tauri::AppHandle,
    processes: State<'_, FrpcProcesses>,
) -> Result<(), String> {
    // Windows requires all worker processes to release the launcher executable.
    if !cfg!(windows) {
        return Ok(());
    }

    let mut children = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {e}"))?;
    if !installing {
        processes.update_installing.store(false, Ordering::SeqCst);
        return Ok(());
    }
    if processes.update_installing.swap(true, Ordering::SeqCst) {
        return Err("正在安装更新".to_string());
    }

    let result = (|| {
        for child in children.values_mut() {
            stop_child(child)?;
        }
        children.clear();

        let path = get_persistence_path(&app_handle)?;
        let tunnels = load_persisted_tunnels_from_file(&path);
        let system = refresh_processes(tunnels.values());
        for info in tunnels.values() {
            stop_recovered_tunnel(&path, &system, info)?;
        }
        write_persisted_tunnels(&path, &HashMap::new())
    })();
    if result.is_err() {
        processes.update_installing.store(false, Ordering::SeqCst);
    }
    result
}

#[tauri::command]
pub async fn is_tunnel_process_alive(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    let mut children = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {e}"))?;
    if let Some(child) = children.get_mut(&tunnel_id) {
        if child
            .try_wait()
            .map_err(|e| format!("查询进程状态失败: {e}"))?
            .is_none()
        {
            return Ok(true);
        }
        children.remove(&tunnel_id);
    } else if persisted_tunnel_running(&app_handle, tunnel_id)? {
        return Ok(true);
    }
    Ok(false)
}
