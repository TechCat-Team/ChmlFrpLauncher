use crate::models::{DownloadInfo, DownloadProgress, FrpcDownload, FrpcInfoResponse};
use crate::utils::{app_data_frpc_path, resolve_frpc_path};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::Path;
use tauri::{Emitter, Manager};

const MAX_RETRIES: u32 = 5;
const CHUNK_SIZE: u64 = 1024 * 1024;
const PROGRESS_EMIT_THRESHOLD: u64 = 100 * 1024;
const DEFAULT_TIMEOUT: u64 = 30;
const DOWNLOAD_TIMEOUT: u64 = 600;
const CONNECT_TIMEOUT: u64 = 30;
const POOL_IDLE_TIMEOUT: u64 = 90;
const TCP_KEEPALIVE: u64 = 60;
const HASH_BUFFER_SIZE: usize = 8192;

const PLATFORM_MAP: &[(&str, &str, &str)] = &[
    ("windows", "x86_64", "win_amd64.exe"),
    ("windows", "x86", "win_386.exe"),
    ("windows", "aarch64", "win_arm64.exe"),
    ("linux", "x86", "linux_386"),
    ("linux", "x86_64", "linux_amd64"),
    ("linux", "arm", "linux_arm"),
    ("linux", "aarch64", "linux_arm64"),
    ("linux", "mips64", "linux_mips64"),
    ("linux", "mips", "linux_mips"),
    ("linux", "riscv64", "linux_riscv64"),
    ("macos", "x86_64", "darwin_amd64"),
    ("macos", "aarch64", "darwin_arm64"),
];

fn build_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    let bypass_proxy = std::env::var("BYPASS_PROXY")
        .unwrap_or_else(|_| "true".to_string())
        .parse::<bool>()
        .unwrap_or(true);

    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .user_agent("ChmlFrpLauncher/1.0");

    if bypass_proxy {
        builder = builder.no_proxy();
    }

    builder.build().map_err(|e| format!("Failed to create client: {}", e))
}

fn get_platform_string(os: &str, arch: &str) -> Option<&'static str> {
    PLATFORM_MAP
        .iter()
        .find(|(o, a, _)| *o == os && *a == arch)
        .map(|(_, _, platform)| *platform)
}

fn matches_arch(os: &str, arch: &str, download_arch: &str) -> bool {
    match (os, arch) {
        ("windows", "x86_64") => download_arch == "x86_64",
        ("windows", "x86") => download_arch == "x86",
        ("windows", "aarch64") => download_arch == "aarch64",
        ("linux", "x86") => download_arch == "x86",
        ("linux", "x86_64") => download_arch == "x86_64",
        ("linux", "arm") => download_arch == "arm",
        ("linux", "aarch64") => download_arch == "aarch64" || download_arch == "arm",
        ("linux", "mips64") => download_arch == "mips64",
        ("linux", "mips") => download_arch == "mips",
        ("linux", "riscv64") => download_arch == "riscv64",
        ("macos", "x86_64") => download_arch == "x86_64",
        ("macos", "aarch64") => download_arch == "aarch64",
        _ => false,
    }
}

fn verify_sha256(file_path: &Path, expected_hash: &str) -> Result<(), String> {
    let mut file = std::fs::File::open(file_path)
        .map_err(|e| format!("无法打开文件进行 hash 验证: {}", e))?;

    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; HASH_BUFFER_SIZE];

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        hasher.update(&buffer[..bytes_read]);
    }

    let computed_hash = hex::encode(hasher.finalize());

    if computed_hash.to_lowercase() != expected_hash.to_lowercase() {
        return Err(format!(
            "文件 hash 验证失败: 预期 {}, 实际 {}",
            expected_hash, computed_hash
        ));
    }

    Ok(())
}

fn set_executable_permission(file_path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(file_path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(file_path, perms).map_err(|e| e.to_string())?;
    }
    let _ = file_path;
    Ok(())
}

pub async fn get_download_info() -> Result<DownloadInfo, String> {
    let api_url = "https://cf-v1.uapis.cn/download/frpc/frpc_info.json";
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let client = build_http_client(DEFAULT_TIMEOUT)?;

    let response = client
        .get(api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch frpc info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "API request failed with status: {}",
            response.status()
        ));
    }

    let info_response: FrpcInfoResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    if info_response.code != 200 || info_response.state != "success" {
        return Err(format!("API returned error: {}", info_response.msg));
    }

    let platform = get_platform_string(os, arch)
        .ok_or_else(|| format!("Unsupported platform: {} {}", os, arch))?;

    let mut matched_downloads: Vec<&FrpcDownload> = info_response
        .data
        .downloads
        .iter()
        .filter(|d| d.platform == platform)
        .collect();

    if matched_downloads.is_empty() {
        let target_os = if os == "macos" { "darwin" } else { os };

        matched_downloads = info_response
            .data
            .downloads
            .iter()
            .filter(|d| d.os == target_os && matches_arch(os, arch, &d.arch))
            .collect();
    }

    let download = match matched_downloads.len() {
        0 => return Err(format!("No matching download found for platform: {} {}", os, arch)),
        1 => matched_downloads[0],
        _ => matched_downloads.iter().max_by_key(|d| d.size).unwrap(),
    };

    Ok(DownloadInfo {
        url: download.link.clone(),
        hash: download.hash.clone(),
        size: download.size,
    })
}

#[tauri::command]
pub async fn check_frpc_exists(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let exists = match resolve_frpc_path(&app_handle) {
        Ok(path) => path.exists(),
        Err(_) => false,
    };
    Ok(exists)
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
    let download_info = get_download_info().await?;
    let url = download_info.url;
    let expected_hash = download_info.hash;
    let expected_size = download_info.size;

    let frpc_path = app_data_frpc_path(&app_handle)?;
    let app_dir = frpc_path
        .parent()
        .ok_or_else(|| "无法获取 frpc 目录".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(DOWNLOAD_TIMEOUT))
        .connect_timeout(std::time::Duration::from_secs(CONNECT_TIMEOUT))
        .pool_idle_timeout(std::time::Duration::from_secs(POOL_IDLE_TIMEOUT))
        .tcp_keepalive(std::time::Duration::from_secs(TCP_KEEPALIVE))
        .user_agent("ChmlFrpLauncher/1.0");

    let bypass_proxy = std::env::var("BYPASS_PROXY")
        .unwrap_or_else(|_| "true".to_string())
        .parse::<bool>()
        .unwrap_or(true);

    let client = if bypass_proxy {
        client.no_proxy()
    } else {
        client
    }
    .build()
    .map_err(|e| format!("Failed to create client: {}", e))?;

    let mut total_size: u64 = expected_size;

    if total_size == 0 {
        if let Ok(head_response) = client.head(&url).send().await {
            if let Some(len) = head_response.content_length() {
                total_size = len;
            }
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&frpc_path)
        .map_err(|e| format!("无法打开文件进行写入: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut retry_count = 0;

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
        if !status.is_success() && status.as_u16() != 206 {
            return Err(format!("下载失败，HTTP 状态码: {}", status));
        }

        if status.as_u16() == 206 {
            if let Some(content_range) = response.headers().get("content-range") {
                if let Ok(range_str) = content_range.to_str() {
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
                    if let Err(e) = file.write_all(&chunk) {
                        return Err(format!(
                            "写入文件失败: {}。这可能是由于杀毒软件拦截，请将 frpc 目录添加到杀毒软件白名单",
                            e
                        ));
                    }

                    let chunk_len = chunk.len() as u64;
                    downloaded += chunk_len;
                    this_chunk_size += chunk_len;

                    let percentage = if total_size > 0 {
                        (downloaded as f64 / total_size as f64) * 100.0
                    } else {
                        0.0
                    };

                    if this_chunk_size >= PROGRESS_EMIT_THRESHOLD {
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
                Err(_) => {
                    chunk_error = true;
                    break;
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

    file.flush().map_err(|e| format!("刷新文件失败: {}", e))?;

    let _ = app_handle.emit(
        "download-progress",
        DownloadProgress {
            downloaded,
            total: total_size,
            percentage: 100.0,
        },
    );

    if total_size > 0 && downloaded < total_size {
        return Err(format!(
            "下载不完整: 预期 {} bytes, 实际下载 {} bytes",
            total_size, downloaded
        ));
    }

    if downloaded == 0 {
        return Err("下载失败: 没有接收到任何数据".to_string());
    }

    eprintln!("开始验证文件 hash...");
    if let Err(e) = verify_sha256(&frpc_path, &expected_hash) {
        let _ = std::fs::remove_file(&frpc_path);
        return Err(e);
    }
    eprintln!("文件 hash 验证成功");

    set_executable_permission(&frpc_path)?;

    Ok(frpc_path.to_string_lossy().to_string())
}
