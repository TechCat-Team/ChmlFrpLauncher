# ChmlFrp Launcher

ChmlFrp 官方启动器，基于 Tauri + React + TypeScript 构建的跨平台桌面应用程序。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## 特性

### 核心功能

- **隧道管理**
  - 创建、启动、停止和删除隧道
  - 支持 HTTP、HTTPS、TCP、UDP 隧道类型
  - 支持自定义隧道配置
  - 隧道状态实时监控

- **进程守护**
  - 自动守护进程，确保隧道稳定运行
  - ChmlFrp 错误自动修复

- **自动启动**
  - 支持软件开机自启动
  - 支持软件启动时自动启动隧道

- **深链接支持**
  - 通过 `chmlfrp://` 协议在浏览器中启动隧道
  - 便捷的远程访问方式

### 用户体验

- **现代化 UI**
  - 毛玻璃效果（macOS HUD Window）
  - 视频背景支持
  - 明暗主题切换
  - 自定义侧边栏（悬浮菜单）
  - 响应式设计

- **系统集成**
  - 系统托盘支持
  - 最小化到托盘
  - 单实例运行
  - 原生窗口控制

- **实时监控**
  - 流量统计（今日上传/下载）
  - 连接数监控
  - 节点延迟显示
  - 隧道日志查看

## 技术栈

- **前端框架**: React 19 + TypeScript
- **桌面框架**: Tauri 2
- **UI 组件**: shadcn/ui
- **样式**: Tailwind CSS 4
- **状态管理**: React Hooks
- **后端语言**: Rust

## 系统要求

- **macOS**: 需要 macOS 10.13 或更高版本
- **Windows**: Windows 10 或更高版本
- **Linux**: 支持的主流 Linux 发行版

## 快速开始

### 安装依赖

使用 pnpm（推荐）:

```bash
pnpm install
```

### 开发模式

启动开发服务器:

```bash
pnpm tauri dev
```

### 构建

构建生产版本:

```bash
pnpm tauri build
```

## 深链接使用

支持通过 `chmlfrp://` 协议在浏览器中启动隧道：

```
chmlfrp://usertoken/start/{tunnel_id}
或
chmlfrp://start/{tunnel_id}
```

## 更新日志

详细的更新日志请查看 [CHANGELOG.md](CHANGELOG.md)

## 许可证

本项目采用 Apache-2.0 许可证。详情请查看 [LICENSE](LICENSE) 文件。

## 贡献

欢迎提交 Issue 和 Pull Request！

### Pull Request要求

- 当编写代码时必须是develop分支，提交pr时必须指向develop分支
- 当`git commit`时请遵循**Conventional Commits**规范

## 联系方式

- **GitHub**: [TechCat-Team/ChmlFrpLauncher](https://github.com/TechCat-Team/ChmlFrpLauncher)
- **官网**: [ChmlFrp](https://www.chmlfrp.net)
- **文档**: [ChmlFrpDocs](https://docs.chmlfrp.net)

## 致谢

感谢所有为项目做出贡献的开发者和用户！

---

Made with love by [TechCat Team](https://github.com/TechCat-Team)
