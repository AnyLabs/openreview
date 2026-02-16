#[cfg(target_os = "windows")]
use std::collections::HashSet;
use std::net::TcpListener;
use std::process::Command;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn is_port_in_use(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

#[tauri::command]
fn force_kill_process_on_port(port: u16) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .map_err(|e| format!("执行 netstat 失败: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "netstat 返回非 0 状态码: {}",
                output.status.code().unwrap_or(-1)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let target = format!(":{port}");
        let mut pids: HashSet<String> = HashSet::new();

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let columns: Vec<&str> = line.split_whitespace().collect();
            if columns.len() < 5 {
                continue;
            }

            let local_addr = columns[1];
            let state = columns[3];
            let pid = columns[4];

            if state.eq_ignore_ascii_case("LISTENING")
                && (local_addr.ends_with(&target) || local_addr.contains(&target))
            {
                pids.insert(pid.to_string());
            }
        }

        for pid in pids {
            let status = Command::new("taskkill")
                .args(["/PID", &pid, "/F"])
                .status()
                .map_err(|e| format!("执行 taskkill 失败 (PID={pid}): {e}"))?;
            if !status.success() {
                return Err(format!(
                    "taskkill 返回非 0 状态码 (PID={pid}): {}",
                    status.code().unwrap_or(-1)
                ));
            }
        }

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("lsof")
            .args(["-ti", &format!("tcp:{port}")])
            .output()
            .map_err(|e| format!("执行 lsof 失败: {e}"))?;

        if !output.status.success() && output.stdout.is_empty() {
            return Ok(());
        }

        if !output.status.success() {
            return Err(format!(
                "lsof 返回非 0 状态码: {}",
                output.status.code().unwrap_or(-1)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for pid in stdout.lines().map(str::trim).filter(|pid| !pid.is_empty()) {
            let status = Command::new("kill")
                .args(["-9", pid])
                .status()
                .map_err(|e| format!("执行 kill 失败 (PID={pid}): {e}"))?;
            if !status.success() {
                return Err(format!(
                    "kill 返回非 0 状态码 (PID={pid}): {}",
                    status.code().unwrap_or(-1)
                ));
            }
        }

        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            is_port_in_use,
            force_kill_process_on_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
