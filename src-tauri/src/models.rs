use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

// 下载进度结构
#[derive(Serialize, Clone)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

// API 响应数据结构
#[derive(Deserialize, Debug)]
pub struct FrpcInfoResponse {
    pub msg: String,
    pub state: String,
    pub code: u32,
    pub data: FrpcInfoData,
}

#[derive(Deserialize, Debug)]
pub struct FrpcInfoData {
    pub downloads: Vec<FrpcDownload>,
    #[allow(dead_code)]
    pub version: String,
    #[allow(dead_code)]
    pub release_notes: Vec<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct FrpcDownload {
    pub hash: String,
    pub os: String,
    #[allow(dead_code)]
    pub hash_type: String,
    pub platform: String,
    pub link: String,
    pub arch: String,
    pub size: u64,
}

// 下载信息结构
pub struct DownloadInfo {
    pub url: String,
    pub hash: String,
    pub size: u64,
}

// 存储运行中的frpc进程
pub struct FrpcProcesses {
    pub processes: Mutex<HashMap<i32, Child>>,
}

impl FrpcProcesses {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }
}

// 隧道类型
#[derive(Clone, Debug)]
pub enum TunnelType {
    Api { config: TunnelConfig },
    Custom { original_id: String },
}

// 进程守护信息
#[derive(Clone)]
pub struct ProcessGuardInfo {
    pub tunnel_id: i32,
    pub tunnel_type: TunnelType,
}

// 守护进程状态管理
pub struct ProcessGuardState {
    pub enabled: Arc<AtomicBool>,
    pub guarded_processes: Arc<Mutex<HashMap<i32, ProcessGuardInfo>>>,
    pub manually_stopped: Arc<Mutex<std::collections::HashSet<i32>>>,
}

impl ProcessGuardState {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
            guarded_processes: Arc::new(Mutex::new(HashMap::new())),
            manually_stopped: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }
}

// 日志消息结构
#[derive(Serialize, Clone)]
pub struct LogMessage {
    pub tunnel_id: i32,
    pub message: String,
    pub timestamp: String,
}

// HTTP请求选项
#[derive(Deserialize)]
pub struct HttpRequestOptions {
    pub url: String,
    pub method: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub bypass_proxy: Option<bool>,
}

// 隧道配置信息
#[derive(Deserialize, Debug, Clone)]
pub struct TunnelConfig {
    pub tunnel_id: i32,
    pub tunnel_name: String,
    pub user_token: String,
    pub server_addr: String,
    pub server_port: u16,
    pub node_token: String,
    pub tunnel_type: String,
    pub local_ip: String,
    pub local_port: u16,
    pub remote_port: Option<u16>,
    pub custom_domains: Option<String>,
    pub http_proxy: Option<String>,
    pub log_level: String,
    pub force_tls: bool,
    pub kcp_optimization: bool,
}
