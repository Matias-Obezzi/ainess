use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct HttpResponse {
    status: u16,
    body: String,
}

#[tauri::command]
pub async fn http_post(
    url: String,
    body: String,
    headers: HashMap<String, String>,
) -> Result<HttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.post(&url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    
    let res = req.body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    let res_body = res.text().await.unwrap_or_default();

    Ok(HttpResponse {
        status,
        body: res_body,
    })
}
