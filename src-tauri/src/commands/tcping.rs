use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};
use log::{info, error, debug, warn};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct TcpingResult {
    pub success: bool,
    pub latency: Option<f64>,
    pub error: Option<String>,
    pub raw_output: Option<String>,
}

#[tauri::command]
pub async fn tcping_host(host: String) -> Result<TcpingResult, String> {
    info!("Starting TCP ping test for host: {}:7000", host);
    
    tokio::task::spawn_blocking(move || {
        let start = Instant::now();
        let addr_str = format!("{}:7000", host);
        
        debug!("Resolving and connecting to: {}", addr_str);
        
        let socket_addr = match addr_str.to_socket_addrs() {
            Ok(addrs) => {
                let mut found = None;
                for addr in addrs {
                    debug!("Resolved address: {}", addr);
                    found = Some(addr);
                    break;
                }
                match found {
                    Some(addr) => addr,
                    None => {
                        let error_msg = format!("Failed to resolve host: {}", host);
                        error!("{}", error_msg);
                        return Ok(TcpingResult {
                            success: false,
                            latency: None,
                            error: Some(error_msg.clone()),
                            raw_output: Some(error_msg),
                        });
                    }
                }
            }
            Err(e) => {
                let error_msg = format!("Failed to parse address '{}': {}", addr_str, e);
                error!("{}", error_msg);
                return Ok(TcpingResult {
                    success: false,
                    latency: None,
                    error: Some(error_msg.clone()),
                    raw_output: Some(error_msg),
                });
            }
        };
        
        debug!("Connecting to resolved address: {}", socket_addr);
        
        match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(3)) {
            Ok(_stream) => {
                let duration = start.elapsed();
                let latency_ms = duration.as_secs_f64() * 1000.0;
                
                info!("TCP ping to {}:7000 successful: {:.2}ms", host, latency_ms);
                
                Ok(TcpingResult {
                    success: true,
                    latency: Some(latency_ms),
                    error: None,
                    raw_output: Some(format!("Connected to {}:7000 in {:.2}ms", host, latency_ms)),
                })
            }
            Err(e) => {
                let duration = start.elapsed();
                let error_msg = format!("TCP connection failed: {}", e);
                
                warn!("TCP ping to {}:7000 failed after {:.2}ms: {}", host, duration.as_secs_f64() * 1000.0, e);
                
                Ok(TcpingResult {
                    success: false,
                    latency: None,
                    error: Some(error_msg.clone()),
                    raw_output: Some(format!("Failed to connect to {}:7000: {}", host, e)),
                })
            }
        }
    })
    .await
    .map_err(|e| {
        error!("Task join error for TCP ping: {}", e);
        format!("Task join error: {}", e)
    })?
}
