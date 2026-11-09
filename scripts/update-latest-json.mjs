#!/usr/bin/env node
// 把 Windows 安装包的更新信息写入 latest.json。
//
// 用法:
//   node scripts/update-latest-json.mjs \
//     --input latest.json --output out/latest.json \
//     --dir out --repo TechCat-Team/ChmlFrpLauncher --tag v0.8.1 --version 0.8.1
//
// --input   从 GitHub Release 下载下来的 latest.json（由 CI 的 macOS / Linux 任务生成）
// --output  写入 Windows 信息后的 latest.json
// --dir     存放 Windows 安装包及其 .sig 文件的目录
//
// 只会新增或覆盖 windows-* 条目，不会改动 darwin-*、linux-* 以及 version、notes、pub_date。

import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`错误: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith("--") || argv[i + 1] === undefined) {
      fail(`参数不正确: ${key ?? ""}`);
    }
    args[key.slice(2)] = argv[i + 1];
  }
  for (const required of ["input", "output", "dir", "repo", "tag", "version"]) {
    if (!args[required]) fail(`缺少参数 --${required}`);
  }
  return args;
}

// 安装包文件名 -> updater 平台键。
// 同一架构同时有 NSIS 和 MSI 时，不带后缀的键（windows-x86_64）优先指向 NSIS，
// 和 tauri-action 生成的 latest.json 保持一致。
const INSTALLERS = [
  { test: /_x64-setup\.exe$/i, arch: "x86_64", kind: "nsis" },
  { test: /_x64(_[^/]+)?\.msi$/i, arch: "x86_64", kind: "msi" },
  { test: /_arm64-setup\.exe$/i, arch: "aarch64", kind: "nsis" },
];

const args = parseArgs(process.argv.slice(2));
const latest = JSON.parse(
  fs.readFileSync(args.input, "utf8").replace(/^﻿/, ""),
);

if (typeof latest.platforms !== "object" || latest.platforms === null) {
  fail("latest.json 缺少 platforms 字段");
}
if (latest.version !== args.version) {
  fail(
    `latest.json 的版本是 ${latest.version}，与要发布的 ${args.version} 不一致`,
  );
}

const entries = [];
for (const name of fs.readdirSync(args.dir).sort()) {
  const rule = INSTALLERS.find((item) => item.test.test(name));
  if (!rule) continue;
  const sigPath = path.join(args.dir, `${name}.sig`);
  if (!fs.existsSync(sigPath)) fail(`缺少签名文件 ${name}.sig`);
  const signature = fs.readFileSync(sigPath, "utf8").trim();
  if (!signature) fail(`${name}.sig 是空的`);
  const url = `https://github.com/${args.repo}/releases/download/${args.tag}/${encodeURIComponent(name)}`;
  entries.push({ ...rule, name, platform: { signature, url } });
}
if (entries.length === 0) fail(`在 ${args.dir} 中没有找到 Windows 安装包`);

// 先清掉旧的 windows-* 条目，避免残留上次发布的内容
for (const key of Object.keys(latest.platforms)) {
  if (key.startsWith("windows-")) delete latest.platforms[key];
}
for (const { arch, kind, platform } of entries) {
  latest.platforms[`windows-${arch}-${kind}`] = platform;
}
for (const arch of new Set(entries.map((entry) => entry.arch))) {
  const preferred =
    entries.find((entry) => entry.arch === arch && entry.kind === "nsis") ??
    entries.find((entry) => entry.arch === arch);
  latest.platforms[`windows-${arch}`] = preferred.platform;
}

fs.writeFileSync(args.output, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
console.log(
  `已写入 ${args.output}，当前平台: ${Object.keys(latest.platforms).sort().join(", ")}`,
);
