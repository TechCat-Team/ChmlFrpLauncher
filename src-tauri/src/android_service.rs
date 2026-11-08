//! 通过 JNI 调用 Kotlin 侧的 `ChmlBridge`，用于前台服务保活和电池优化设置。

use jni::{
    objects::{GlobalRef, JClass, JObject, JValue, JValueOwned},
    JNIEnv, JavaVM,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};

struct Bridge {
    vm: JavaVM,
    class: GlobalRef,
}

static BRIDGE: OnceLock<Bridge> = OnceLock::new();

/// 应用句柄，用于 Activity 重建后恢复主窗口
pub static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
/// 主窗口随 Activity 销毁（例如从最近任务划掉）而进程仍存活时置位
pub static WINDOW_DESTROYED: AtomicBool = AtomicBool::new(false);

/// 由 `MainActivity.onCreate` 调用，传入 `ChmlBridge` 类。
/// 非主线程无法通过 FindClass 加载应用自身的类，因此在这里保存全局引用。
#[no_mangle]
pub extern "system" fn Java_net_chmlfrp_launcher_MainActivity_nativeInit<'local>(
    env: JNIEnv<'local>,
    _this: JObject<'local>,
    bridge: JClass<'local>,
) {
    if BRIDGE.get().is_none() {
        if let (Ok(vm), Ok(class)) = (env.get_java_vm(), env.new_global_ref(&bridge)) {
            let _ = BRIDGE.set(Bridge { vm, class });
        }
    }
    // 进程存活但旧窗口已销毁：新的 Activity 需要重新创建主窗口，否则会白屏
    if WINDOW_DESTROYED.swap(false, Ordering::SeqCst) {
        if let Some(app) = APP.get().cloned() {
            std::thread::spawn(move || recreate_main_window(&app));
        }
    }
}

fn recreate_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if !app.webview_windows().is_empty() {
        return;
    }
    let Some(config) = app.config().app.windows.first() else {
        return;
    };
    if let Err(err) = tauri::WebviewWindowBuilder::from_config(app, config).and_then(|b| b.build()) {
        eprintln!("[ChmlFrpLauncher] 重建主窗口失败: {err}");
    }
}

fn call(name: &str, sig: &str, args: &[JValue]) -> Result<JValueOwned<'static>, String> {
    let bridge = BRIDGE.get().ok_or("Android 桥接尚未初始化")?;
    let mut env = bridge
        .vm
        .attach_current_thread_permanently()
        .map_err(|e| e.to_string())?;
    let class: &JClass = bridge.class.as_obj().into();
    let result = env.call_static_method(class, name, sig, args);
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_describe();
        let _ = env.exception_clear();
        return Err(format!("调用 {name} 失败"));
    }
    result.map_err(|e| e.to_string())
}

/// 根据运行中的隧道数量启动、刷新或停止前台服务
pub fn update_tunnels(count: i32) {
    if let Err(err) = call("updateTunnels", "(I)V", &[JValue::Int(count)]) {
        eprintln!("[ChmlFrpLauncher] 更新前台服务失败: {err}");
    }
}

#[tauri::command]
pub fn is_ignoring_battery_optimizations() -> Result<bool, String> {
    call("isIgnoringBatteryOptimizations", "()Z", &[])?
        .z()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn request_ignore_battery_optimizations() -> Result<bool, String> {
    call("requestIgnoreBatteryOptimizations", "()Z", &[])?
        .z()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_app_settings() -> Result<bool, String> {
    call("openAppSettings", "()Z", &[])?
        .z()
        .map_err(|e| e.to_string())
}
