//! 通过 JNI 调用 Kotlin 侧的 `ChmlBridge`，用于前台服务保活和电池优化设置。

use jni::{
    errors::LogErrorAndDefault,
    jni_sig, jni_str,
    objects::{Global, JClass, JObject, JString, JValue},
    Env, EnvUnowned, JavaVM,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};

struct Bridge {
    class: Global<JClass<'static>>,
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
    mut env: EnvUnowned<'local>,
    _this: JObject<'local>,
    bridge: JClass<'local>,
) {
    if BRIDGE.get().is_none() {
        env.with_env(|env| -> jni::errors::Result<()> {
            let class = env.new_global_ref(&bridge)?;
            let _ = BRIDGE.set(Bridge { class });
            Ok(())
        })
        .resolve::<LogErrorAndDefault>();
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

/// 让当前线程附着到 JVM 并在闭包内调用桥接类的静态方法。
/// 附着会为闭包开辟新的局部引用帧，并清除未处理的 Java 异常，因此无需手动释放引用。
fn with_bridge<T>(
    f: impl FnOnce(&mut Env, &JClass) -> jni::errors::Result<T>,
) -> Result<T, String> {
    let bridge = BRIDGE.get().ok_or("Android 桥接尚未初始化")?;
    let vm = JavaVM::singleton().map_err(|e| e.to_string())?;
    vm.attach_current_thread(|env| f(env, &bridge.class))
        .map_err(|e| e.to_string())
}

/// 读取 Android 当前网络的 HTTP 代理（`http://host:port`）。reqwest 在 Android 上读不到系统代理
pub fn system_proxy() -> Option<String> {
    with_bridge(|env, class| {
        let value = env
            .call_static_method(
                class,
                jni_str!("getSystemProxy"),
                jni_sig!("()Ljava/lang/String;"),
                &[],
            )?
            .l()?;
        let value = env.cast_local::<JString>(value)?;
        value.try_to_string(env)
    })
    .ok()
    .filter(|proxy| !proxy.is_empty())
}

/// 根据运行中的隧道数量启动、刷新或停止前台服务
pub fn update_tunnels(count: i32) {
    let result = with_bridge(|env, class| {
        env.call_static_method(
            class,
            jni_str!("updateTunnels"),
            jni_sig!("(I)V"),
            &[JValue::Int(count)],
        )?
        .v()
    });
    if let Err(err) = result {
        eprintln!("[ChmlFrpLauncher] 更新前台服务失败: {err}");
    }
}

#[tauri::command]
pub fn is_ignoring_battery_optimizations() -> Result<bool, String> {
    with_bridge(|env, class| {
        env.call_static_method(
            class,
            jni_str!("isIgnoringBatteryOptimizations"),
            jni_sig!("()Z"),
            &[],
        )?
        .z()
    })
}

#[tauri::command]
pub fn request_ignore_battery_optimizations() -> Result<bool, String> {
    with_bridge(|env, class| {
        env.call_static_method(
            class,
            jni_str!("requestIgnoreBatteryOptimizations"),
            jni_sig!("()Z"),
            &[],
        )?
        .z()
    })
}

#[tauri::command]
pub fn open_app_settings() -> Result<bool, String> {
    with_bridge(|env, class| {
        env.call_static_method(class, jni_str!("openAppSettings"), jni_sig!("()Z"), &[])?
            .z()
    })
}
