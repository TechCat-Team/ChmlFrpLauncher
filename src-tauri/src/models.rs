use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Child;
use std::sync::Mutex;

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

