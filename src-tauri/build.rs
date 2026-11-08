use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        build_android_frpc();
    } else {
        build_frpc();
    }
    tauri_build::build();
}

fn build_frpc() {
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let bridge = manifest.join("frpc");
    let source = env::var_os("CHMLFRP_SOURCE_DIR")
        .map(|path| manifest.join(path))
        .unwrap_or_else(|| manifest.join("../../frp"));
    assert!(
        source.join("go.mod").is_file(),
        "找不到 ChmlFrp 源码 {}，请设置 CHMLFRP_SOURCE_DIR",
        source.display()
    );

    let target = env::var("TARGET").unwrap();
    let (os, arch, compiler, archive) = match target.as_str() {
        "x86_64-pc-windows-msvc" => ("windows", "amd64", "gcc", "chmlfrpc.lib"),
        "x86_64-unknown-linux-gnu" => ("linux", "amd64", "cc", "libchmlfrpc.a"),
        "aarch64-unknown-linux-gnu" => ("linux", "arm64", "cc", "libchmlfrpc.a"),
        "x86_64-apple-darwin" => ("darwin", "amd64", "clang", "libchmlfrpc.a"),
        "aarch64-apple-darwin" => ("darwin", "arm64", "clang", "libchmlfrpc.a"),
        _ => panic!("FRP 核心不支持构建目标 {target}"),
    };

    for name in [
        "CHMLFRP_SOURCE_DIR",
        "CHMLFRP_CC",
        "GOTOOLCHAIN",
        "MACOSX_DEPLOYMENT_TARGET",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    println!("cargo:rerun-if-changed={}", bridge.display());
    for path in [
        "go.mod",
        "go.sum",
        "assets",
        "client",
        "cmd/frpc/sub",
        "pkg",
        "web/frpc",
    ] {
        println!("cargo:rerun-if-changed={}", source.join(path).display());
    }

    fs::copy(source.join("go.mod"), out.join("go.mod")).expect("无法复制 Go 模块定义");
    fs::copy(bridge.join("main.go"), out.join("main.go")).expect("无法复制 FRP 桥接代码");
    fs::copy(source.join("go.sum"), out.join("go.sum")).expect("无法复制 Go 依赖校验和");
    let mut module = Command::new("go");
    module
        .current_dir(&out)
        .env("GOWORK", "off")
        .args([
            "mod",
            "edit",
            "-module=chmlfrp-launcher/frpc",
            "-require=github.com/fatedier/frp@v0.0.0",
        ])
        .arg(format!(
            "-replace=github.com/fatedier/frp={}",
            source.display()
        ));
    if os == "windows" {
        // Older Go releases emit unwind tables that MSVC cannot link.
        module.arg("-go=1.27.1");
    }
    run_go(&mut module, "配置 ChmlFrp 源码路径");
    let tags = if source.join("web/frpc/dist/index.html").is_file() {
        "frpc"
    } else {
        "frpc,noweb"
    };
    let compiler = env::var_os("CHMLFRP_CC").unwrap_or_else(|| compiler.into());
    let mut build = Command::new("go");
    build
        .current_dir(&out)
        .env("GOWORK", "off")
        .env("GOOS", os)
        .env("GOARCH", arch)
        .env("CGO_ENABLED", "1")
        .env("CC", compiler)
        .args([
            "build",
            "-mod=mod",
            "-trimpath",
            "-tags",
            tags,
            "-buildmode=c-archive",
            "-o",
        ])
        .arg(out.join(archive))
        .arg(".");
    if os == "darwin" && env::var_os("MACOSX_DEPLOYMENT_TARGET").is_none() {
        build.env("MACOSX_DEPLOYMENT_TARGET", "12.0");
    }
    run_go(&mut build, "编译 FRP 静态库");

    println!("cargo:rustc-link-search=native={}", out.display());
    if os == "darwin" {
        link_framework("CoreFoundation");
        link_framework("Security");
    }
}

fn run_go(command: &mut Command, step: &str) {
    let status = command.status().unwrap_or_else(|error| {
        panic!("{step}失败，请确认 Go 已安装: {error}");
    });
    assert!(status.success(), "{step}失败: {status}");
}

fn link_framework(name: &str) {
    println!("cargo:rustc-link-arg-bin=ChmlFrpLauncher=-framework");
    println!("cargo:rustc-link-arg-bin=ChmlFrpLauncher={name}");
}

fn build_android_frpc() {
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let bridge = manifest.join("frpc-android/main.go");
    let source = env::var_os("CHMLFRP_SOURCE_DIR")
        .map(|path| manifest.join(path))
        .unwrap_or_else(|| manifest.join("../../frp"));
    let (arch, abi, cc) = match env::var("TARGET").unwrap().as_str() {
        "x86_64-linux-android" => ("amd64", "x86_64", "x86_64-linux-android24-clang"),
        "aarch64-linux-android" => ("arm64", "arm64-v8a", "aarch64-linux-android24-clang"),
        "i686-linux-android" => ("386", "x86", "i686-linux-android24-clang"),
        "armv7-linux-androideabi" => ("arm", "armeabi-v7a", "armv7a-linux-androideabi24-clang"),
        target => panic!("不支持的 Android 架构: {target}"),
    };
    let ndk = PathBuf::from(env::var_os("NDK_HOME").expect("请设置 NDK_HOME"));
    let host = if cfg!(target_os = "windows") {
        "windows-x86_64"
    } else if cfg!(target_os = "macos") {
        "darwin-x86_64"
    } else {
        "linux-x86_64"
    };
    let compiler = ndk
        .join("toolchains/llvm/prebuilt")
        .join(host)
        .join("bin")
        .join(if cfg!(target_os = "windows") {
            format!("{cc}.cmd")
        } else {
            cc.to_owned()
        });
    println!("cargo:rerun-if-env-changed=CHMLFRP_SOURCE_DIR");
    println!("cargo:rerun-if-env-changed=NDK_HOME");
    println!("cargo:rerun-if-changed={}", bridge.display());
    for dir in ["go.mod", "go.sum", "client", "pkg", "assets", "web/frpc"] {
        println!("cargo:rerun-if-changed={}", source.join(dir).display());
    }
    fs::copy(source.join("go.mod"), out.join("go.mod")).expect("无法复制 Go 模块定义");
    fs::copy(source.join("go.sum"), out.join("go.sum")).expect("无法复制 Go 依赖校验和");
    fs::copy(&bridge, out.join("main.go")).expect("无法复制 Android FRP 桥接代码");
    let mut module = Command::new("go");
    module
        .current_dir(&out)
        .env("GOWORK", "off")
        .args([
            "mod",
            "edit",
            "-module=chmlfrp-launcher/frpc-android",
            "-require=github.com/fatedier/frp@v0.0.0",
        ])
        .arg(format!(
            "-replace=github.com/fatedier/frp={}",
            source.display()
        ));
    run_go(&mut module, "配置 Android FRP 源码路径");
    let library = out.join("libchmlfrpc.so");
    let mut build = Command::new("go");
    build
        .current_dir(&out)
        .env("GOWORK", "off")
        .env("GOOS", "android")
        .env("GOARCH", arch)
        .env("CGO_ENABLED", "1")
        .env("CC", compiler)
        .env("CGO_LDFLAGS", "-Wl,-soname,libchmlfrpc.so")
        .args([
            "build",
            "-mod=mod",
            "-trimpath",
            "-tags",
            "frpc,noweb",
            "-buildmode=c-shared",
            "-o",
        ])
        .arg(&library)
        .arg(".");
    if arch == "arm" {
        build.env("GOARM", "7");
    }
    run_go(&mut build, "编译 Android FRP 核心");
    let jni = manifest.join("gen/android/app/src/main/jniLibs").join(abi);
    fs::create_dir_all(&jni).expect("无法创建 Android 原生库目录");
    fs::copy(&library, jni.join("libchmlfrpc.so")).expect("无法复制 Android FRP 核心");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=dylib=chmlfrpc");
}
