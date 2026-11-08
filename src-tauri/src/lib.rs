#[cfg(not(target_os = "android"))]
mod commands;
mod models;
#[cfg(not(target_os = "android"))]
mod utils;

#[cfg(not(target_os = "android"))]
mod desktop;
#[cfg(not(target_os = "android"))]
pub use desktop::run;
#[cfg(not(target_os = "android"))]
pub use models::{FrpcProcesses, ProcessGuardState};
#[cfg(not(target_os = "android"))]
pub use utils::FRPC_WORKER_ARG;

#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "android")]
pub use android::run;
