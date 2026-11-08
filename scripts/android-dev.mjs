import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// Windows NDK 链接器可能无法处理 Cargo 输出路径中的非 ASCII 字符。
const env = { ...process.env };
if (process.platform === "win32" && !env.CARGO_TARGET_DIR) {
  env.CARGO_TARGET_DIR = join(tmpdir(), "chmlfrp-android-target");
}
const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
const child = spawn(process.execPath, [cli, "android", "dev", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
