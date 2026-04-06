use crate::models::HttpRequestOptions;
use reqwest::Url;
use serde::Serialize;

#[derive(Serialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub body: String,
}

fn validate_request_url(raw_url: &str) -> Result<Url, String> {
    let url = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {}", e))?;
    if url.scheme() != "https" {
        return Err("仅允许 https 请求".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URL 不允许包含凭据".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "URL 缺少 host".to_string())?;
    if !is_allowed_host(host) {
        return Err("URL 不在允许列表".to_string());
    }
    Ok(url)
}

fn is_allowed_host(host: &str) -> bool {
    host == "cf-v2.uapis.cn"
        || host == "cf-v1.uapis.cn"
        || host.ends_with(".uapis.cn")
        || host == "account-api.qzhua.net"
        || host == "chmlfrp.net"
        || host.ends_with(".chmlfrp.net")
}

async fn send_request(options: HttpRequestOptions) -> Result<HttpResponsePayload, String> {
    let bypass_proxy = options.bypass_proxy.unwrap_or(true);
    let url = validate_request_url(&options.url)?;

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("ChmlFrpLauncher/1.0");

    if bypass_proxy {
        client_builder = client_builder.proxy(reqwest::Proxy::custom(
            move |_url| -> Option<reqwest::Url> { None },
        ));
    }

    let client = client_builder
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let mut request = match options.method.as_str() {
        "GET" => client.get(url.clone()),
        "POST" => client.post(url.clone()),
        "PUT" => client.put(url.clone()),
        "DELETE" => client.delete(url.clone()),
        "PATCH" => client.patch(url.clone()),
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
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(HttpResponsePayload {
        status: status.as_u16(),
        body,
    })
}

#[tauri::command]
pub async fn http_request(options: HttpRequestOptions) -> Result<String, String> {
    let response = send_request(options).await?;

    if !(200..300).contains(&response.status) {
        return Err(format!("HTTP {}: {}", response.status, response.body));
    }

    Ok(response.body)
}

#[tauri::command]
pub async fn http_request_raw(options: HttpRequestOptions) -> Result<HttpResponsePayload, String> {
    send_request(options).await
}
