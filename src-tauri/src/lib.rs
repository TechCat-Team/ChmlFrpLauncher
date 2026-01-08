use futures_util::StreamExt;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command as StdCommand, Stdio};
use std::sync::Mutex;
use std::thread;
use tauri::{Emitter, Manager, State};

// 隐藏用户日志里面的token
fn sanitize_log(message: &str, user_token: &str) -> String {
    let mut result = message.to_string();

    result = result.replace(user_token, "***TOKEN***");

    if let Some(dot_pos) = user_token.find('.') {
        let first_part = &user_token[..dot_pos];
        let second_part = &user_token[dot_pos + 1..];

        if first_part.len() >= 6 {
            result = result.replace(first_part, "***");
        }
        if second_part.len() >= 6 {
            result = result.replace(second_part, "***");
        }
    }

    if user_token.len() >= 10 {
        for window_size in (8..=user_token.len()).rev() {
            if window_size <= user_token.len() {
                let substr = &user_token[..window_size];
                if result.contains(substr) && substr.len() >= 8 {
                    result = result.replace(substr, "***");
                }
            }
        }
    }

    result
}

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    percentage: f64,
}

// 存储运行中的frpc进程
struct FrpcProcesses {
    processes: Mutex<HashMap<i32, Child>>,
}

impl FrpcProcesses {
    fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
async fn check_frpc_exists(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let frpc_path = if cfg!(target_os = "windows") {
        app_dir.join("frpc.exe")
    } else {
        app_dir.join("frpc")
    };

    Ok(frpc_path.exists())
}

#[tauri::command]
async fn get_download_url() -> Result<String, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let platform = match (os, arch) {
        ("windows", "x86_64") => "win_amd64.exe",
        ("windows", "x86") => "win_386.exe",
        ("windows", "aarch64") => "win_arm64.exe",
        ("linux", "x86") => "linux_386",
        ("linux", "x86_64") => "linux_amd64",
        ("linux", "arm") => "linux_arm",
        ("linux", "aarch64") => "linux_arm64",
        ("linux", "mips64") => "linux_mips64",
        ("linux", "mips") => "linux_mips",
        ("linux", "riscv64") => "linux_riscv64",
        ("macos", "x86_64") => "darwin_amd64",
        ("macos", "aarch64") => "darwin_arm64",
        _ => return Err(format!("Unsupported platform: {} {}", os, arch)),
    };

    Ok(format!("https://cf-v1.uapis.cn/download/frpc/{}", platform))
}

#[tauri::command]
async fn download_frpc(app_handle: tauri::AppHandle) -> Result<String, String> {
    let url = get_download_url().await?;

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    // 确保目录存在
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let frpc_path = if cfg!(target_os = "windows") {
        app_dir.join("frpc.exe")
    } else {
        app_dir.join("frpc")
    };

    // 下载文件
    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .connect_timeout(std::time::Duration::from_secs(30))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .user_agent("ChmlFrpLauncher/1.0");
    
    // 检查是否需要绕过代理
    let bypass_proxy = std::env::var("BYPASS_PROXY")
        .unwrap_or_else(|_| "true".to_string())
        .parse::<bool>()
        .unwrap_or(true);
    
    if bypass_proxy {
        client_builder = client_builder.no_proxy();
    }
    
    let client = client_builder
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    // 获取文件总大小
    let mut total_size: u64 = 0;

    // 先尝试 HEAD 请求
    if let Ok(head_response) = client.head(&url).send().await {
        if let Some(len) = head_response.content_length() {
            total_size = len;
        }
    }

    // 如果 HEAD 失败，将通过第一次 GET 请求的 Range 响应获取
    if total_size == 0 {
        eprintln!("HEAD 请求未获取文件大小，将从 GET 响应头获取");
    }

    // 创建或打开文件
    use std::fs::OpenOptions;
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&frpc_path)
        .map_err(|e| e.to_string())?;

    let mut downloaded: u64 = 0;
    let mut retry_count = 0;
    const MAX_RETRIES: u32 = 5;
    const CHUNK_SIZE: u64 = 1024 * 1024; // 1MB 分块

    // 断点续传
    loop {
        let mut request = client.get(&url);

        if downloaded == 0 && total_size == 0 {
            request = request.header("Range", format!("bytes=0-{}", CHUNK_SIZE - 1));
        } else if downloaded > 0 {
            let end = if total_size > 0 {
                std::cmp::min(downloaded + CHUNK_SIZE - 1, total_size - 1)
            } else {
                downloaded + CHUNK_SIZE - 1
            };
            request = request.header("Range", format!("bytes={}-{}", downloaded, end));
        } else if total_size > 0 {
            let end = std::cmp::min(CHUNK_SIZE - 1, total_size - 1);
            request = request.header("Range", format!("bytes=0-{}", end));
        }

        let response = match request.send().await {
            Ok(resp) => resp,
            Err(e) => {
                retry_count += 1;
                if retry_count >= MAX_RETRIES {
                    return Err(format!("下载失败，已重试 {} 次: {}", MAX_RETRIES, e));
                }
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
        };

        let status = response.status();
        let is_success = status.is_success() || status.as_u16() == 206; // 206 = Partial Content
        if !is_success {
            return Err(format!("下载失败，HTTP 状态码: {}", status));
        }

        if status.as_u16() == 206 {
            if let Some(content_range) = response.headers().get("content-range") {
                if let Ok(range_str) = content_range.to_str() {
                    // 格式: bytes start-end/total
                    if let Some(slash_pos) = range_str.rfind('/') {
                        if let Ok(size) = range_str[slash_pos + 1..].parse::<u64>() {
                            if size > 0 && total_size != size {
                                total_size = size;
                            }
                        }
                    }
                }
            }
        } else if let Some(content_len) = response.content_length() {
            if total_size == 0 {
                total_size = content_len;
            }
        }

        retry_count = 0;

        let mut stream = response.bytes_stream();
        let mut chunk_error = false;
        let mut this_chunk_size: u64 = 0;

        while let Some(item) = stream.next().await {
            match item {
                Ok(chunk) => {
                    use std::io::Write;
                    file.write_all(&chunk)
                        .map_err(|e| format!("写入文件失败: {}", e))?;

                    let chunk_len = chunk.len() as u64;
                    downloaded += chunk_len;
                    this_chunk_size += chunk_len;

                    let percentage = if total_size > 0 {
                        (downloaded as f64 / total_size as f64) * 100.0
                    } else {
                        0.0
                    };

                    // 发送进度更新（每 100KB 发送一次）
                    if this_chunk_size >= 100 * 1024 {
                        let _ = app_handle.emit(
                            "download-progress",
                            DownloadProgress {
                                downloaded,
                                total: total_size,
                                percentage,
                            },
                        );
                        this_chunk_size = 0;
                    }
                }
                Err(_e) => {
                    chunk_error = true;
                    break; // 跳出内层循环，外层循环会重试
                }
            }
        }

        // 如果没有错误(END，此逻辑容易出现安全问题，API开发完成后会从API获取HASH和文件大小)
        if !chunk_error {
            // 检查是否已下载完成
            if total_size > 0 && downloaded >= total_size {
                break;
            }
            // 如果不知道总大小且本次获取少于预期，认为完成
            if total_size == 0 && this_chunk_size < CHUNK_SIZE {
                break;
            }
            // 如果没有获取到任何数据，认为已完成
            if this_chunk_size == 0 {
                break;
            }
        }

        // 如果有错误，等待后重试
        if chunk_error {
            retry_count += 1;
            if retry_count >= MAX_RETRIES {
                return Err(format!("下载失败，已重试 {} 次", MAX_RETRIES));
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }

    // 确保文件已完全写入
    use std::io::Write;
    file.flush().map_err(|e| format!("刷新文件失败: {}", e))?;

    // 发送最终进度（100%）
    let _ = app_handle.emit(
        "download-progress",
        DownloadProgress {
            downloaded,
            total: total_size,
            percentage: 100.0,
        },
    );

    // 验证下载的文件大小（如果知道预期大小）
    if total_size > 0 && downloaded < total_size {
        return Err(format!(
            "下载不完整: 预期 {} bytes, 实际下载 {} bytes",
            total_size, downloaded
        ));
    }

    // 确保至少下载了一些数据
    if downloaded == 0 {
        return Err("下载失败: 没有接收到任何数据".to_string());
    }

    // 在 Unix 系统上设置执行权限
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&frpc_path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&frpc_path, perms).map_err(|e| e.to_string())?;
    }

    Ok(frpc_path.to_string_lossy().to_string())
}

#[derive(serde::Serialize, Clone)]
struct LogMessage {
    tunnel_id: i32,
    message: String,
    timestamp: String,
}

#[tauri::command]
async fn start_frpc(
    app_handle: tauri::AppHandle,
    tunnel_id: i32,
    user_token: String,
    processes: State<'_, FrpcProcesses>,
) -> Result<String, String> {
    eprintln!("========================================");
    eprintln!("[隧道 {}] 开始启动 frpc", tunnel_id);

    // 检查是否已经在运行
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

    // 在 Unix 系统上确保有执行权限
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
    let mut child = StdCommand::new(&frpc_path)
        .current_dir(&app_dir) // 设置工作目录，避免在 src-tauri 目录生成文件
        .arg("-u")
        .arg(&user_token)
        .arg("-p")
        .arg(tunnel_id.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
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

    // 存储进程
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
async fn stop_frpc(tunnel_id: i32, processes: State<'_, FrpcProcesses>) -> Result<String, String> {
    eprintln!("[隧道 {}] 请求停止进程", tunnel_id);

    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    if let Some(mut child) = procs.remove(&tunnel_id) {
        eprintln!("[隧道 {}] 找到进程，准备停止", tunnel_id);
        // 尝试优雅地终止进程
        match child.kill() {
            Ok(_) => {
                eprintln!("[隧道 {}] kill 信号已发送", tunnel_id);
                // 等待进程退出
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
async fn is_frpc_running(
    tunnel_id: i32,
    processes: State<'_, FrpcProcesses>,
) -> Result<bool, String> {
    let mut procs = processes.processes.lock().map_err(|e| {
        eprintln!("[隧道 {}] 检查状态时获取锁失败: {}", tunnel_id, e);
        format!("获取进程锁失败: {}", e)
    })?;

    if let Some(child) = procs.get_mut(&tunnel_id) {
        // 检查进程是否还在运行
        match child.try_wait() {
            Ok(Some(status)) => {
                // 进程已退出，移除它
                eprintln!("[隧道 {}] 进程已退出，状态: {:?}", tunnel_id, status);
                procs.remove(&tunnel_id);
                Ok(false)
            }
            Ok(None) => {
                // 进程还在运行
                Ok(true)
            }
            Err(e) => {
                // 检查失败，假设已停止
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
async fn test_log_event(app_handle: tauri::AppHandle, tunnel_id: i32) -> Result<String, String> {
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
async fn get_running_tunnels(processes: State<'_, FrpcProcesses>) -> Result<Vec<i32>, String> {
    let mut procs = processes
        .processes
        .lock()
        .map_err(|e| format!("获取进程锁失败: {}", e))?;

    let mut running_tunnels = Vec::new();
    let mut stopped_tunnels = Vec::new();

    // 检查所有进程
    for (tunnel_id, child) in procs.iter_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                // 进程已退出
                stopped_tunnels.push(*tunnel_id);
            }
            Ok(None) => {
                // 进程还在运行
                running_tunnels.push(*tunnel_id);
            }
            Err(_) => {
                // 检查失败，假设已停止
                stopped_tunnels.push(*tunnel_id);
            }
        }
    }

    // 清理已停止的进程
    for tunnel_id in stopped_tunnels {
        procs.remove(&tunnel_id);
    }

    Ok(running_tunnels)
}

#[tauri::command]
async fn is_autostart_enabled(
    state: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
) -> Result<bool, String> {
    state
        .is_enabled()
        .map_err(|e| format!("检查开机自启状态失败: {}", e))
}

#[tauri::command]
async fn set_autostart(
    enabled: bool,
    state: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
) -> Result<(), String> {
    if enabled {
        state
            .enable()
            .map_err(|e| format!("启用开机自启失败: {}", e))
    } else {
        state
            .disable()
            .map_err(|e| format!("禁用开机自启失败: {}", e))
    }
}

#[derive(serde::Deserialize)]
struct HttpRequestOptions {
    url: String,
    method: String,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
    bypass_proxy: Option<bool>,
}

#[tauri::command]
async fn http_request(options: HttpRequestOptions) -> Result<String, String> {
    let bypass_proxy = options.bypass_proxy.unwrap_or(true);
    
    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("ChmlFrpLauncher/1.0");
    
    // 如果绕过代理，使用自定义代理函数返回 None 来禁用代理
    if bypass_proxy {
        client_builder = client_builder.proxy(
            reqwest::Proxy::custom(move |_url| -> Option<reqwest::Url> { None })
        );
    }
    
    let client = client_builder
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;
    
    let mut request = match options.method.as_str() {
        "GET" => client.get(&options.url),
        "POST" => client.post(&options.url),
        "PUT" => client.put(&options.url),
        "DELETE" => client.delete(&options.url),
        "PATCH" => client.patch(&options.url),
        _ => return Err(format!("Unsupported method: {}", options.method)),
    };
    
    if let Some(headers) = options.headers {
        for (key, value) in headers {
            request = request.header(&key, &value);
        }
    }
    
    if let Some(body) = options.body {
        request = request.body(body);
    }
    
    let response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), text));
    }
    
    Ok(text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(FrpcProcesses::new())
        .invoke_handler(tauri::generate_handler![
            check_frpc_exists,
            get_download_url,
            download_frpc,
            start_frpc,
            stop_frpc,
            is_frpc_running,
            get_running_tunnels,
            test_log_event,
            is_autostart_enabled,
            set_autostart,
            http_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
