// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod frpc_worker;

fn main() -> std::process::ExitCode {
    if let Some(status) = frpc_worker::run_if_requested() {
        return status;
    }

    app_lib::run();
    std::process::ExitCode::SUCCESS
}
