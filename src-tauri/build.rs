use std::fs;
use std::path::Path;

const REMOTE_PAGE_PLACEHOLDER: &str = "<!doctype html>\n<meta charset=\"utf-8\">\n<title>ainess remoto</title>\n<p>Falta la build de la página remota. Corré <code>npm run build:remote</code> y volvé a compilar.</p>\n";

fn main() {
    // `src/remote.rs` embeds `dist-remote/index.html` with `include_str!`, and that file is a
    // build artifact (`npm run build:remote`). A fresh clone has none, and `cargo check` would
    // fail before npm ever ran, so leave a placeholder behind.
    let page = Path::new("../dist-remote/index.html");
    if !page.exists() {
        if let Some(dir) = page.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(page, REMOTE_PAGE_PLACEHOLDER);
    }
    println!("cargo:rerun-if-changed=../dist-remote/index.html");

    tauri_build::build()
}
