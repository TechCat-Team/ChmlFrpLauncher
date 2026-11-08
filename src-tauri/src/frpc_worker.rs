use std::ffi::{c_char, CString, OsStr};
use std::process::ExitCode;

use app_lib::FRPC_WORKER_ARG;

#[link(name = "chmlfrpc", kind = "static")]
extern "C" {
    fn chmlfrpRun(config_path: *const c_char);

    // Go's Windows archive registers its initializer in .ctors, which MSVC
    // does not invoke. The worker calls it once before entering the Go code.
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    fn _rt0_amd64_windows_lib();
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    fn _rt0_arm64_windows_lib();
}

pub fn run_if_requested() -> Option<ExitCode> {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(OsStr::new(FRPC_WORKER_ARG)) {
        return None;
    }

    let config = args.next();
    let path = match config.as_deref() {
        #[cfg(unix)]
        Some(path) => {
            use std::os::unix::ffi::OsStrExt;
            CString::new(path.as_bytes()).ok()
        }
        #[cfg(windows)]
        Some(path) => path.to_str().and_then(|path| CString::new(path).ok()),
        None => None,
    };
    let Some(path) = path.filter(|_| args.next().is_none()) else {
        eprintln!("FRP worker 需要一个有效的配置文件路径");
        return Some(ExitCode::FAILURE);
    };

    unsafe {
        #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
        _rt0_amd64_windows_lib();
        #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
        _rt0_arm64_windows_lib();
        chmlfrpRun(path.as_ptr());
    }
    Some(ExitCode::SUCCESS)
}
