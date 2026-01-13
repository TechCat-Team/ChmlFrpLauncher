use crate::models::{DownloadInfo, DownloadProgress, FrpcDownload, FrpcInfoResponse};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use tauri::{Emitter, Manager};

// 从 API 获取下载信息
pub async fn get_download_info() -> Result<DownloadInfo, String> {
    let api_url = "https://cf-v1.uapis.cn/download/frpc/frpc_info.json";
    
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
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

    let response = client
        .get(api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch frpc info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API request failed with status: {}", response.status()));
    }

    let info_response: FrpcInfoResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    if info_response.code != 200 || info_response.state != "success" {
        return Err(format!("API returned error: {}", info_response.msg));
    }

    let mut matched_downloads: Vec<&FrpcDownload> = Vec::new();
    
    // 首先尝试通过 platform 字段匹配（更精确）
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

    for download in &info_response.data.downloads {
        if download.platform == platform {
            matched_downloads.push(download);
        }
    }

    // 如果 platform 匹配失败，尝试通过 os 和 arch 匹配
    if matched_downloads.is_empty() {
        let target_os = match os {
            "macos" => "darwin",
            _ => os,
        };
        
        for download in &info_response.data.downloads {
            if download.os == target_os {
                let matches_arch = match (os, arch) {
                    ("windows", "x86_64") => download.arch == "x86_64",
                    ("windows", "x86") => download.arch == "x86",
                    ("windows", "aarch64") => download.arch == "aarch64",
                    ("linux", "x86") => download.arch == "x86",
                    ("linux", "x86_64") => download.arch == "x86_64",
                    ("linux", "arm") => download.arch == "arm",
                    ("linux", "aarch64") => download.arch == "aarch64" || download.arch == "arm",
                    ("linux", "mips64") => download.arch == "mips64",
                    ("linux", "mips") => download.arch == "mips",
                    ("linux", "riscv64") => download.arch == "riscv64",
                    ("macos", "x86_64") => download.arch == "x86_64",
                    ("macos", "aarch64") => download.arch == "aarch64",
                    _ => false,
                };
                
                if matches_arch {
                    matched_downloads.push(download);
                }
            }
        }
    }

    let download = if matched_downloads.is_empty() {
        return Err(format!(
            "No matching download found for platform: {} {}",
            os, arch
        ));
    } else if matched_downloads.len() == 1 {
        matched_downloads[0]
    } else {
        // 如果有多个匹配项，选择 size 最大的（通常是最新版本）
        matched_downloads
            .iter()
            .max_by_key(|d| d.size)
            .unwrap()
    };

    Ok(DownloadInfo {
        url: download.link.clone(),
        hash: download.hash.clone(),
        size: download.size,
    })
}

#[tauri::command]
pub async fn check_frpc_exists(app_handle: tauri::AppHandle) -> Result<bool, String> {
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
pub async fn get_frpc_directory(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    Ok(app_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_download_url() -> Result<String, String> {
    let info = get_download_info().await?;
    Ok(info.url)
}

#[tauri::command]
pub async fn download_frpc(app_handle: tauri::AppHandle) -> Result<String, String> {
    // 从 API 获取下载信息（包括 URL、hash、size）
    let download_info = get_download_info().await?;
    let url = download_info.url;
    let expected_hash = download_info.hash;
    let expected_size = download_info.size;

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let frpc_path = if cfg!(target_os = "windows") {
        app_dir.join("frpc.exe")
    } else {
        app_dir.join("frpc")
    };

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

    // 使用 API 返回的文件大小，如果没有则尝试从 HTTP 响应获取
    let mut total_size: u64 = expected_size;

    // 如果 API 没有提供大小，尝试 HEAD 请求获取
    if total_size == 0 {
        if let Ok(head_response) = client.head(&url).send().await {
            if let Some(len) = head_response.content_length() {
                total_size = len;
            }
        }
        
        if total_size == 0 {
            eprintln!("HEAD 请求未获取文件大小，将从 GET 响应头获取");
        }
    }

    use std::fs::OpenOptions;
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&frpc_path)
        .map_err(|e| format!("无法打开文件进行写入: {}", e))?;

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
                    if let Err(e) = file.write_all(&chunk) {
                        // 提供更详细的错误信息，帮助前端识别杀毒软件拦截
                        let err_msg = format!("写入文件失败: {}。这可能是由于杀毒软件拦截，请将 frpc 目录添加到杀毒软件白名单", e);
                        return Err(err_msg);
                    }

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

        if !chunk_error {
            if total_size > 0 && downloaded >= total_size {
                break;
            }
            if total_size == 0 && this_chunk_size < CHUNK_SIZE {
                break;
            }
            if this_chunk_size == 0 {
                break;
            }
        }

        if chunk_error {
            retry_count += 1;
            if retry_count >= MAX_RETRIES {
                return Err(format!("下载失败，已重试 {} 次", MAX_RETRIES));
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }

    use std::io::Write;
    file.flush().map_err(|e| format!("刷新文件失败: {}", e))?;

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

    if downloaded == 0 {
        return Err("下载失败: 没有接收到任何数据".to_string());
    }

    // 验证 SHA256 hash
    eprintln!("开始验证文件 hash...");
    let mut file_for_hash = std::fs::File::open(&frpc_path)
        .map_err(|e| format!("无法打开文件进行 hash 验证: {}", e))?;
    
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 8192]; // 8KB 缓冲区
    
    loop {
        let bytes_read = file_for_hash
            .read(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        
        if bytes_read == 0 {
            break;
        }
        
        hasher.update(&buffer[..bytes_read]);
    }
    
    let computed_hash = hasher.finalize();
    let computed_hash_hex = hex::encode(computed_hash);
    
    eprintln!("预期 hash: {}", expected_hash);
    eprintln!("计算 hash: {}", computed_hash_hex);
    
    if computed_hash_hex.to_lowercase() != expected_hash.to_lowercase() {
        // 删除损坏的文件
        let _ = fs::remove_file(&frpc_path);
        return Err(format!(
            "文件 hash 验证失败: 预期 {}, 实际 {}",
            expected_hash, computed_hash_hex
        ));
    }
    
    eprintln!("文件 hash 验证成功");

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

