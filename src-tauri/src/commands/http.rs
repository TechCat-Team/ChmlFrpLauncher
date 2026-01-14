use crate::models::HttpRequestOptions;

#[tauri::command]
pub async fn http_request(options: HttpRequestOptions) -> Result<String, String> {
    let bypass_proxy = options.bypass_proxy.unwrap_or(true);

    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("ChmlFrpLauncher/1.0");

    // 如果绕过代理，使用自定义代理函数返回 None 来禁用代理
    if bypass_proxy {
        client_builder = client_builder.proxy(reqwest::Proxy::custom(
            move |_url| -> Option<reqwest::Url> { None },
        ));
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
