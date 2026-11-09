//! 生成 frpc 配置文件（FRP v1 TOML 格式）。
//!
//! FRP 已弃用旧版 INI 格式。ChmlFrp API 返回的隧道额外参数（`ap` 字段）仍是 INI 键名，
//! 这里按 FRP 自身的 legacy 转换规则（`pkg/config/legacy/conversion.go`）映射为 v1 字段。

use crate::models::TunnelConfig;
use toml::{Table, Value};

/// 官方隧道配置文件扩展名。FRP 根据扩展名判断配置格式。
pub(crate) const CONFIG_EXT: &str = "toml";

/// 官方隧道的配置文件名
#[cfg_attr(target_os = "android", allow(dead_code))]
pub(crate) fn api_config_file_name(tunnel_id: i32) -> String {
    format!("g_{tunnel_id}.{CONFIG_EXT}")
}

/// 旧版本生成的 INI 配置文件名，用于识别升级前启动的进程并清理残留文件
#[cfg_attr(target_os = "android", allow(dead_code))]
pub(crate) fn legacy_api_config_file_name(tunnel_id: i32) -> String {
    format!("g_{tunnel_id}.ini")
}

pub(crate) fn generate_frpc_config(config: &TunnelConfig) -> Result<String, String> {
    let mut root = Table::new();
    root.insert("serverAddr".into(), config.server_addr.clone().into());
    root.insert("serverPort".into(), i64::from(config.server_port).into());
    root.insert("user".into(), config.user_token.clone().into());

    let mut auth = Table::new();
    auth.insert("token".into(), config.node_token.clone().into());
    root.insert("auth".into(), auth.into());

    let mut log = Table::new();
    log.insert("level".into(), config.log_level.clone().into());
    root.insert("log".into(), log.into());

    let mut transport = Table::new();
    if let Some(proxy_url) = &config.http_proxy {
        transport.insert("proxyURL".into(), proxy_url.clone().into());
    }
    transport.insert("tcpMux".into(), true.into());
    transport.insert("poolCount".into(), 5.into());
    let mut tls = Table::new();
    tls.insert("enable".into(), config.force_tls.into());
    transport.insert("tls".into(), tls.into());
    root.insert("transport".into(), transport.into());

    let mut proxy = Table::new();
    proxy.insert("name".into(), config.tunnel_name.clone().into());
    proxy.insert("type".into(), config.tunnel_type.clone().into());
    proxy.insert("localIP".into(), config.local_ip.clone().into());
    proxy.insert("localPort".into(), i64::from(config.local_port).into());

    match config.tunnel_type.as_str() {
        "tcp" | "udp" => {
            let remote_port = config
                .remote_port
                .ok_or("TCP/UDP 隧道缺少 remote_port 参数")?;
            proxy.insert("remotePort".into(), i64::from(remote_port).into());
        }
        "http" | "https" => {
            let domains = config
                .custom_domains
                .as_deref()
                .ok_or("HTTP/HTTPS 隧道缺少 custom_domains 参数")?;
            proxy.insert("customDomains".into(), split_list(domains));
        }
        other => return Err(format!("不支持的隧道类型: {other}")),
    }

    if config.encryption {
        set_path(&mut proxy, &["transport", "useEncryption"], true.into());
    }
    if config.compression {
        set_path(&mut proxy, &["transport", "useCompression"], true.into());
    }

    if let Some(extra_params) = &config.extra_params {
        apply_extra_params(&mut proxy, extra_params)?;
    }

    root.insert("proxies".into(), Value::Array(vec![proxy.into()]));
    toml::to_string(&root).map_err(|e| format!("生成配置文件失败: {e}"))
}

/// 逗号分隔的列表（如 `custom_domains = a.com,b.com`）
fn split_list(raw: &str) -> Value {
    Value::Array(
        raw.split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| Value::String(s.to_owned()))
            .collect(),
    )
}

/// 按路径写入嵌套表，例如 `["transport", "useEncryption"]`
fn set_path(table: &mut Table, path: &[&str], value: Value) {
    let (last, parents) = path.split_last().expect("路径不能为空");
    let mut current = table;
    for key in parents {
        let entry = current
            .entry(key.to_string())
            .or_insert_with(|| Value::Table(Table::new()));
        if !entry.is_table() {
            *entry = Value::Table(Table::new());
        }
        current = entry.as_table_mut().unwrap();
    }
    current.insert(last.to_string(), value);
}

#[derive(Clone, Copy)]
enum Kind {
    Str,
    Int,
    Bool,
    List,
}

/// 旧版 INI 隧道参数对应的 v1 字段路径
fn legacy_proxy_key(key: &str) -> Option<(Vec<String>, Kind)> {
    let path = |p: &[&str]| p.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    if let Some(name) = key.strip_prefix("plugin_header_") {
        return (!name.is_empty())
            .then(|| (path(&["plugin", "requestHeaders", "set", name]), Kind::Str));
    }
    if let Some(name) = key.strip_prefix("header_") {
        return (!name.is_empty()).then(|| (path(&["requestHeaders", "set", name]), Kind::Str));
    }
    if let Some(name) = key.strip_prefix("meta_") {
        return (!name.is_empty()).then(|| (path(&["metadatas", name]), Kind::Str));
    }
    let (p, kind): (&[&str], Kind) = match key {
        "local_ip" => (&["localIP"], Kind::Str),
        "local_port" => (&["localPort"], Kind::Int),
        "remote_port" => (&["remotePort"], Kind::Int),
        "use_encryption" => (&["transport", "useEncryption"], Kind::Bool),
        "use_compression" => (&["transport", "useCompression"], Kind::Bool),
        "bandwidth_limit" => (&["transport", "bandwidthLimit"], Kind::Str),
        "bandwidth_limit_mode" => (&["transport", "bandwidthLimitMode"], Kind::Str),
        "proxy_protocol_version" => (&["transport", "proxyProtocolVersion"], Kind::Str),
        "group" => (&["loadBalancer", "group"], Kind::Str),
        "group_key" => (&["loadBalancer", "groupKey"], Kind::Str),
        "health_check_type" => (&["healthCheck", "type"], Kind::Str),
        "health_check_timeout_s" => (&["healthCheck", "timeoutSeconds"], Kind::Int),
        "health_check_max_failed" => (&["healthCheck", "maxFailed"], Kind::Int),
        "health_check_interval_s" => (&["healthCheck", "intervalSeconds"], Kind::Int),
        "health_check_url" => (&["healthCheck", "path"], Kind::Str),
        "custom_domains" => (&["customDomains"], Kind::List),
        "subdomain" => (&["subdomain"], Kind::Str),
        "locations" => (&["locations"], Kind::List),
        "http_user" => (&["httpUser"], Kind::Str),
        "http_pwd" => (&["httpPassword"], Kind::Str),
        "host_header_rewrite" => (&["hostHeaderRewrite"], Kind::Str),
        "route_by_http_user" => (&["routeByHTTPUser"], Kind::Str),
        "multiplexer" => (&["multiplexer"], Kind::Str),
        "sk" => (&["secretKey"], Kind::Str),
        "allow_users" => (&["allowUsers"], Kind::List),
        "plugin" => (&["plugin", "type"], Kind::Str),
        "plugin_local_addr" => (&["plugin", "localAddr"], Kind::Str),
        "plugin_host_header_rewrite" => (&["plugin", "hostHeaderRewrite"], Kind::Str),
        "plugin_crt_path" => (&["plugin", "crtPath"], Kind::Str),
        "plugin_key_path" => (&["plugin", "keyPath"], Kind::Str),
        "plugin_http_user" => (&["plugin", "httpUser"], Kind::Str),
        "plugin_http_passwd" => (&["plugin", "httpPassword"], Kind::Str),
        "plugin_user" => (&["plugin", "username"], Kind::Str),
        "plugin_passwd" => (&["plugin", "password"], Kind::Str),
        "plugin_local_path" => (&["plugin", "localPath"], Kind::Str),
        "plugin_strip_prefix" => (&["plugin", "stripPrefix"], Kind::Str),
        "plugin_unix_path" => (&["plugin", "unixPath"], Kind::Str),
        _ => return None,
    };
    Some((path(p), kind))
}

fn convert_value(key: &str, raw: &str, kind: Kind) -> Result<Value, String> {
    let invalid = || format!("额外参数 {key} 的值无效: {raw}");
    Ok(match kind {
        Kind::Str => Value::String(raw.to_owned()),
        Kind::Int => Value::Integer(raw.parse::<i64>().map_err(|_| invalid())?),
        Kind::Bool => match raw.to_ascii_lowercase().as_str() {
            "true" => Value::Boolean(true),
            "false" => Value::Boolean(false),
            _ => return Err(invalid()),
        },
        Kind::List => split_list(raw),
    })
}

/// v1 写法的参数（如 `transport.bandwidthLimit = "1MB"`）：值按 TOML 解析，失败时视为字符串
fn parse_v1_value(raw: &str) -> Value {
    toml::from_str::<Table>(&format!("v = {raw}"))
        .ok()
        .and_then(|mut t| t.remove("v"))
        .unwrap_or_else(|| Value::String(raw.trim_matches('"').to_owned()))
}

/// 将额外参数写入隧道配置。参数可以是旧版 INI 键名，也可以是 v1 写法；
/// 与旧版行为一致，额外参数会覆盖前面生成的同名字段，其它 section 中的内容被忽略。
fn apply_extra_params(proxy: &mut Table, extra_params: &str) -> Result<(), String> {
    let normalized = extra_params.replace("\\r\\n", "\n").replace("\\n", "\n");
    let mut skipping_section = false;
    for line in normalized.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') {
            skipping_section = true;
            continue;
        }
        if skipping_section {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let (key, value) = (key.trim(), value.trim());
        // 名称和类型由隧道本身决定，不允许被覆盖
        if key.is_empty() || matches!(key, "name" | "type" | "role") {
            continue;
        }
        if let Some((path, kind)) = legacy_proxy_key(key) {
            let path: Vec<&str> = path.iter().map(String::as_str).collect();
            set_path(proxy, &path, convert_value(key, value, kind)?);
        } else if key.contains('.') || key.chars().any(|c| c.is_ascii_uppercase()) {
            let path: Vec<&str> = key.split('.').map(str::trim).collect();
            if path.iter().any(|p| p.is_empty()) {
                return Err(format!("额外参数 {key} 的格式无效"));
            }
            set_path(proxy, &path, parse_v1_value(value));
        } else {
            // 旧版 FRP 同样会忽略隧道段中无法识别的键
            eprintln!("[ChmlFrpLauncher] 忽略无法识别的额外参数: {key}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(tunnel_type: &str) -> TunnelConfig {
        TunnelConfig {
            tunnel_id: 1,
            tunnel_name: "mc".into(),
            user_token: "user\"token".into(),
            server_addr: "node.example.com".into(),
            server_port: 7000,
            node_token: "node-token".into(),
            tunnel_type: tunnel_type.into(),
            local_ip: "127.0.0.1".into(),
            local_port: 25565,
            remote_port: Some(42651),
            custom_domains: Some("a.example.com, b.example.com".into()),
            http_proxy: None,
            log_level: "info".into(),
            force_tls: false,
            extra_params: None,
            encryption: false,
            compression: false,
        }
    }

    fn parse(config: &TunnelConfig) -> Table {
        toml::from_str(&generate_frpc_config(config).unwrap()).unwrap()
    }

    fn proxy(table: &Table) -> &Table {
        table["proxies"].as_array().unwrap()[0].as_table().unwrap()
    }

    #[test]
    fn tcp_tunnel() {
        let mut config = sample("tcp");
        config.encryption = true;
        config.http_proxy = Some("socks5://127.0.0.1:1080".into());
        let table = parse(&config);
        println!("{}", generate_frpc_config(&config).unwrap());
        assert_eq!(table["serverAddr"].as_str(), Some("node.example.com"));
        assert_eq!(table["user"].as_str(), Some("user\"token"));
        assert_eq!(table["auth"]["token"].as_str(), Some("node-token"));
        assert_eq!(table["transport"]["tls"]["enable"].as_bool(), Some(false));
        assert_eq!(table["transport"]["proxyURL"].as_str(), Some("socks5://127.0.0.1:1080"));
        let p = proxy(&table);
        assert_eq!(p["remotePort"].as_integer(), Some(42651));
        assert_eq!(p["transport"]["useEncryption"].as_bool(), Some(true));
        assert!(p.get("customDomains").is_none());
    }

    #[test]
    fn http_tunnel_domains() {
        let table = parse(&sample("http"));
        let domains = proxy(&table)["customDomains"].as_array().unwrap();
        assert_eq!(domains.len(), 2);
        assert_eq!(domains[1].as_str(), Some("b.example.com"));
        assert!(proxy(&table).get("remotePort").is_none());
    }

    #[test]
    fn legacy_extra_params() {
        let mut config = sample("http");
        config.extra_params = Some(
            "proxy_protocol_version = v2\\nbandwidth_limit = 1MB\\nheader_X-From-Where = frp\\n\
             locations = /,/api\\nuse_compression = true\\nhealth_check_interval_s = 10\\n\
             name = hacked\\nunknown_key = 1\\n[common]\\ntoken = evil"
                .into(),
        );
        let table = parse(&config);
        println!("{}", generate_frpc_config(&config).unwrap());
        let p = proxy(&table);
        assert_eq!(p["name"].as_str(), Some("mc"));
        assert_eq!(p["transport"]["proxyProtocolVersion"].as_str(), Some("v2"));
        assert_eq!(p["transport"]["bandwidthLimit"].as_str(), Some("1MB"));
        assert_eq!(p["transport"]["useCompression"].as_bool(), Some(true));
        assert_eq!(p["requestHeaders"]["set"]["X-From-Where"].as_str(), Some("frp"));
        assert_eq!(p["locations"].as_array().unwrap().len(), 2);
        assert_eq!(p["healthCheck"]["intervalSeconds"].as_integer(), Some(10));
        assert!(p.get("unknown_key").is_none());
        assert_eq!(table["auth"]["token"].as_str(), Some("node-token"));
    }

    #[test]
    fn v1_extra_params_and_plugin() {
        let mut config = sample("tcp");
        config.extra_params = Some(
            "transport.bandwidthLimit = \"2MB\"\nplugin = socks5\nplugin_user = u\nplugin_passwd = p"
                .into(),
        );
        let table = parse(&config);
        let p = proxy(&table);
        assert_eq!(p["transport"]["bandwidthLimit"].as_str(), Some("2MB"));
        assert_eq!(p["plugin"]["type"].as_str(), Some("socks5"));
        assert_eq!(p["plugin"]["username"].as_str(), Some("u"));
    }

    #[test]
    fn invalid_extra_value() {
        let mut config = sample("tcp");
        config.extra_params = Some("use_encryption = maybe".into());
        assert!(generate_frpc_config(&config).is_err());
    }

    #[test]
    fn missing_remote_port() {
        let mut config = sample("tcp");
        config.remote_port = None;
        assert!(generate_frpc_config(&config).is_err());
    }
}
