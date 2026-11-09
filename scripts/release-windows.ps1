<#
.SYNOPSIS
  在持有代码签名证书的 Windows 机器上构建、签名并发布 Windows 版本。

.DESCRIPTION
  前提：GitHub CI 已经完成 macOS / Linux 构建，并在该版本的 Release 里生成了 latest.json。

  流程：
    1. 检查环境，确认 Release 和 latest.json 已存在
    2. 构建 Windows 安装包（x64 / arm64）
    3. 用 signtool 对安装包做代码签名
    4. 用 Tauri 更新密钥重新生成 .sig（代码签名会改变文件内容，构建时生成的 .sig 会失效）
    5. 重新下载 latest.json，写入 Windows 的更新信息
    6. 把安装包、.sig 和 latest.json 上传回该版本的 Release

  需要提前准备：
    - 工具：Node.js、pnpm、Rust(rustup)、Go、GitHub CLI(gh，并已 gh auth login)、
            signtool(Windows SDK)、MSVC 构建工具（含 ARM64 组件，用于 arm64）
    - C 编译器：x64 需要 gcc(MSYS2 UCRT64)，arm64 需要 llvm-mingw 的 aarch64-w64-mingw32-clang
    - 复制项目根目录的 .env.example 为 .env 并填写（脚本每次运行都会自动读取，.env 不会被提交）：
        CHMLFRP_SOURCE_DIR                  ChmlFrp 内核源码目录（私有仓库）
        WINDOWS_CERT_SHA1                   代码签名证书的 SHA1 指纹
        TAURI_SIGNING_PRIVATE_KEY(_PATH)    Tauri 自动更新密钥，有密码时再填 TAURI_SIGNING_PRIVATE_KEY_PASSWORD
      优先级：命令行参数 > 已设置的系统环境变量 > .env

.EXAMPLE
  pnpm release:windows

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\release-windows.ps1 -Targets x64

.EXAMPLE
  # 只构建、签名，不上传，用来检查产物
  powershell -ExecutionPolicy Bypass -File scripts\release-windows.ps1 -SkipUpload
#>
[CmdletBinding()]
param(
  # 要发布的 tag，默认取 package.json 的版本号，例如 v0.8.1
  [string]$Tag,
  # 要构建的架构：x64、arm64，可用逗号分隔
  [string[]]$Targets = @('x64', 'arm64'),
  [string]$Repo = 'TechCat-Team/ChmlFrpLauncher',

  # 代码签名证书的 SHA1 指纹，默认读取 .env 里的 WINDOWS_CERT_SHA1
  [string]$CertSha1,
  # 时间戳服务器，默认读取 WINDOWS_TIMESTAMP_URL，都没有时用 Sectigo
  [string]$TimestampUrl,

  # ChmlFrp 内核源码目录，默认读取 .env 里的 CHMLFRP_SOURCE_DIR
  [string]$SourceDir,
  # 编译 Go 静态库用的 C 编译器
  [string]$CcX64 = 'gcc',
  [string]$CcArm64 = 'aarch64-w64-mingw32-clang',

  # 跳过代码签名（仅用于测试构建流程，产物不能对外发布）
  [switch]$SkipSign,
  # 只构建并签名，不上传
  [switch]$SkipUpload,
  # latest.json 里缺少 macOS / Linux 条目时仍然继续
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
if ($SourceDir -and (Test-Path $SourceDir)) { $SourceDir = (Resolve-Path $SourceDir).Path }
$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

# 读取 .env：只补充尚未设置的环境变量，所以命令行里临时设置的值优先
function Import-DotEnv([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  foreach ($line in Get-Content $Path -Encoding UTF8) {
    $text = $line.Trim()
    if (-not $text -or $text.StartsWith('#')) { continue }
    if ($text -notmatch '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    $quoted = $value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))
    if ($quoted) {
      $value = $value.Substring(1, $value.Length - 2)
    } else {
      $value = ($value -replace '\s+#.*$', '').Trim()
    }
    if ($value -and -not [Environment]::GetEnvironmentVariable($name)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

# 运行外部命令，失败（退出码非 0）时抛出错误
function Invoke-Native([string]$File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令失败（退出码 $LASTEXITCODE）: $File $($Arguments -join ' ')"
  }
}

# 只关心成功与否的命令；输出丢弃，stderr 不会被当成错误
function Test-NativeSuccess([string]$File, [string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $File @Arguments 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Test-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Find-SignTool {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  if (Test-Path $kits) {
    $found = Get-ChildItem $kits -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\x64\\' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

# 从 Release 下载 latest.json 到指定路径
function Get-LatestJson([string]$Destination) {
  $directory = Split-Path $Destination -Parent
  $downloaded = Join-Path $directory 'latest.json'
  if (Test-Path $downloaded) { Remove-Item $downloaded -Force }
  Invoke-Native gh @('release', 'download', $Tag, '--repo', $Repo, '--pattern', 'latest.json', '--dir', $directory, '--clobber')
  if ($downloaded -ne $Destination) { Move-Item $downloaded $Destination -Force }
}

# 确认 latest.json 版本正确，且 CI 已写入 macOS / Linux 的条目
function Assert-LatestJson([string]$Path) {
  $json = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($json.version -ne $Version) {
    throw "latest.json 的版本是 $($json.version)，与要发布的 $Version 不一致"
  }
  $keys = @($json.platforms.PSObject.Properties.Name)
  $missing = @()
  if (-not ($keys | Where-Object { $_ -like 'darwin-*' })) { $missing += 'macOS' }
  if (-not ($keys | Where-Object { $_ -like 'linux-*' })) { $missing += 'Linux' }
  if ($missing.Count -gt 0) {
    $message = "latest.json 里还没有 $($missing -join '、') 的条目，GitHub CI 可能还没跑完"
    if ($Force) { Write-Warning $message } else { throw "$message（确认无误可加 -Force 继续）" }
  }
}

# ---------------------------------------------------------------- 基本信息

Import-DotEnv (Join-Path $RepoRoot '.env')
if (-not $CertSha1) { $CertSha1 = $env:WINDOWS_CERT_SHA1 }
if (-not $TimestampUrl) { $TimestampUrl = $env:WINDOWS_TIMESTAMP_URL }
if (-not $TimestampUrl) { $TimestampUrl = 'http://timestamp.sectigo.com' }
if (-not $SourceDir) { $SourceDir = $env:CHMLFRP_SOURCE_DIR }

$Targets = @($Targets | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
$TargetInfo = @{
  x64   = @{ Triple = 'x86_64-pc-windows-msvc';  Bundles = 'nsis,msi'; Compiler = $CcX64 }
  arm64 = @{ Triple = 'aarch64-pc-windows-msvc'; Bundles = 'nsis';     Compiler = $CcArm64 }
}
foreach ($name in $Targets) {
  if (-not $TargetInfo.ContainsKey($name)) { throw "不支持的架构: $name（可选 x64、arm64）" }
}

$Version = (Get-Content (Join-Path $RepoRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$TauriVersion = (Get-Content (Join-Path $RepoRoot 'src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($TauriVersion -ne $Version) {
  throw "package.json($Version) 与 tauri.conf.json($TauriVersion) 的版本号不一致"
}
if (-not $Tag) { $Tag = "v$Version" }
if ($Tag -ne "v$Version") {
  throw "tag($Tag) 与当前版本号(v$Version)不一致，请先切到对应版本的代码"
}

Write-Host "发布版本: $Tag    架构: $($Targets -join ', ')    仓库: $Repo"

# ---------------------------------------------------------------- 环境检查

Write-Step '检查环境'

foreach ($tool in @('node', 'pnpm', 'cargo', 'rustup', 'go', 'gh')) {
  if (-not (Test-Command $tool)) { throw "找不到 $tool，请先安装并加入 PATH" }
}
foreach ($name in $Targets) {
  $compiler = $TargetInfo[$name].Compiler
  if (-not (Test-Command $compiler)) {
    throw "找不到 C 编译器 $compiler（构建 $name 的 Go 静态库需要），请安装并加入 PATH，或用 -Cc$(if ($name -eq 'x64') { 'X64' } else { 'Arm64' }) 指定"
  }
}

if (-not (Test-NativeSuccess gh @('auth', 'status'))) { throw 'gh 尚未登录，请先运行 gh auth login（需要对该仓库有 Release 写权限）' }

if (-not $SourceDir) { throw '请在 .env 里设置 CHMLFRP_SOURCE_DIR（或用 -SourceDir 指定）ChmlFrp 内核源码目录' }
$SourceDir = (Resolve-Path $SourceDir).Path
if (-not (Test-Path (Join-Path $SourceDir 'go.mod'))) { throw "$SourceDir 下没有 go.mod，不是 ChmlFrp 源码目录" }
$env:CHMLFRP_SOURCE_DIR = $SourceDir

if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
  if ($env:TAURI_SIGNING_PRIVATE_KEY_PATH -and (Test-Path $env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    # 统一成 TAURI_SIGNING_PRIVATE_KEY，避免和 _PATH 同时存在时产生冲突
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $env:TAURI_SIGNING_PRIVATE_KEY_PATH -Raw
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH
  } else {
    throw '请在 .env 里设置 TAURI_SIGNING_PRIVATE_KEY_PATH（或 TAURI_SIGNING_PRIVATE_KEY），用于生成自动更新签名'
  }
}

$SignTool = $null
if (-not $SkipSign) {
  if ($CertSha1 -notmatch '^[0-9A-Fa-f]{40}$') {
    throw "代码签名证书指纹无效（当前为 '$CertSha1'）。请在 .env 里把 WINDOWS_CERT_SHA1 设为 40 位十六进制指纹"
  }
  $SignTool = Find-SignTool
  if (-not $SignTool) { throw '找不到 signtool.exe，请安装 Windows SDK' }
  Write-Host "signtool: $SignTool"
} else {
  Write-Warning '已跳过代码签名，产物不能对外发布'
}

$Work = Join-Path $RepoRoot 'dist-windows'
$Stage = Join-Path $Work $Tag
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage -Force | Out-Null

# 先下载一次 latest.json，Release 不存在或 CI 没跑完时尽早失败，不必等构建结束
Write-Step "检查 Release $Tag"
if (-not (Test-NativeSuccess gh @('release', 'view', $Tag, '--repo', $Repo))) { throw "找不到 Release $Tag，请先让 GitHub CI 完成 macOS / Linux 构建" }
$earlyJson = Join-Path $Work 'latest.early.json'
Get-LatestJson $earlyJson
Assert-LatestJson $earlyJson

# ---------------------------------------------------------------- 构建

Write-Step '安装前端依赖'
Invoke-Native pnpm @('install', '--frozen-lockfile')

$dashboard = Join-Path $SourceDir 'web\frpc\dist\index.html'
if (-not (Test-Path $dashboard)) {
  Write-Step '构建内嵌的 FRP 管理面板'
  Push-Location (Join-Path $SourceDir 'web')
  try {
    Invoke-Native npm @('ci')
    Invoke-Native npm @('run', 'build', '--workspace', 'frpc')
  } finally {
    Pop-Location
  }
}

# 让 Tauri 在打包时用 signtool 给应用本体和安装包签名（%1 会被替换成文件路径）
$signConfig = $null
if (-not $SkipSign) {
  $config = @{
    bundle = @{
      windows = @{
        signCommand = @{
          cmd  = $SignTool
          args = @('sign', '/fd', 'sha256', '/sha1', $CertSha1, '/tr', $TimestampUrl, '/td', 'sha256', '%1')
        }
      }
    }
  }
  $signConfig = Join-Path $Work 'sign-config.json'
  [IO.File]::WriteAllText($signConfig, ($config | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
}

foreach ($name in $Targets) {
  $info = $TargetInfo[$name]
  Write-Step "构建 Windows $name ($($info.Triple))"

  Invoke-Native rustup @('target', 'add', $info.Triple)
  $env:CHMLFRP_CC = $info.Compiler

  $bundleDir = Join-Path $RepoRoot "src-tauri\target\$($info.Triple)\release\bundle"
  if (Test-Path $bundleDir) { Remove-Item $bundleDir -Recurse -Force }

  $buildArgs = @('exec', 'tauri', 'build', '--target', $info.Triple, '--bundles', $info.Bundles)
  if ($signConfig) { $buildArgs += @('--config', $signConfig) }
  Invoke-Native pnpm $buildArgs

  $outputs = @(Get-ChildItem $bundleDir -Recurse -File |
    Where-Object { $_.Name -like "*_$($Version)_*" -and $_.Extension -in '.exe', '.msi', '.sig' })
  if (-not ($outputs | Where-Object { $_.Name -like '*-setup.exe' })) {
    throw "没有在 $bundleDir 找到安装包，请检查上面的构建输出"
  }
  $outputs | Copy-Item -Destination $Stage -Force
}

# ---------------------------------------------------------------- 签名

$installers = @(Get-ChildItem $Stage -File | Where-Object { $_.Extension -in '.exe', '.msi' })
if ($installers.Count -eq 0) { throw "$Stage 里没有安装包" }

if (-not $SkipSign) {
  Write-Step '代码签名'
  $signArgs = @('sign', '/v', '/fd', 'sha256', '/sha1', $CertSha1, '/tr', $TimestampUrl, '/td', 'sha256') + @($installers | ForEach-Object { $_.FullName })
  $signed = $false
  foreach ($attempt in 1..3) {
    & $SignTool @signArgs
    if ($LASTEXITCODE -eq 0) { $signed = $true; break }
    Write-Warning "签名失败，可能是时间戳服务器暂时不可用，5 秒后重试（$attempt/3）"
    Start-Sleep -Seconds 5
  }
  if (-not $signed) { throw '代码签名失败' }

  foreach ($file in $installers) {
    Invoke-Native $SignTool @('verify', '/pa', '/q', $file.FullName)
  }

  # 代码签名改变了安装包内容，必须用 Tauri 更新密钥重新生成 .sig，否则自动更新会校验失败
  Write-Step '重新生成自动更新签名 (.sig)'
  foreach ($file in $installers) {
    $sig = "$($file.FullName).sig"
    if (Test-Path $sig) { Remove-Item $sig -Force }
    Invoke-Native pnpm @('exec', 'tauri', 'signer', 'sign', '--app-version', $Version, $file.FullName)
    if (-not (Test-Path $sig)) { throw "没有生成 $($file.Name).sig" }
  }
}

# ---------------------------------------------------------------- 更新 latest.json

Write-Step '更新 latest.json'
# 构建耗时较长，这期间 CI 可能更新过 latest.json，所以上传前重新下载最新的
$freshJson = Join-Path $Work 'latest.fresh.json'
Get-LatestJson $freshJson
Assert-LatestJson $freshJson
Invoke-Native node @(
  (Join-Path $PSScriptRoot 'update-latest-json.mjs'),
  '--input', $freshJson,
  '--output', (Join-Path $Stage 'latest.json'),
  '--dir', $Stage,
  '--repo', $Repo,
  '--tag', $Tag,
  '--version', $Version
)

if ($SkipUpload) {
  Write-Step '已跳过上传'
  Write-Host "产物目录: $Stage"
  return
}

# ---------------------------------------------------------------- 上传

Write-Step "上传到 GitHub Release $Tag"
$uploadFiles = @(Get-ChildItem $Stage -File | ForEach-Object { $_.FullName })
Invoke-Native gh (@('release', 'upload', $Tag) + $uploadFiles + @('--repo', $Repo, '--clobber'))

Write-Step '验证'
$checkJson = Join-Path $Work 'latest.check.json'
Get-LatestJson $checkJson
$platforms = @((Get-Content $checkJson -Raw -Encoding UTF8 | ConvertFrom-Json).platforms.PSObject.Properties.Name)
Write-Host "Release 里的 latest.json 现有平台: $($platforms -join ', ')"
if (-not ($platforms | Where-Object { $_ -like 'windows-*' })) { throw '上传后 latest.json 里仍然没有 Windows 条目，请手动检查' }

Write-Host ''
Write-Host "完成: https://github.com/$Repo/releases/tag/$Tag" -ForegroundColor Green
