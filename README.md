# Open Reviewer

基于 Tauri 的桌面应用，用于 GitLab Merge Request 的 AI 代码审查。

## 功能特性

### 核心功能

- **GitLab 集成** - 支持 Personal Access Token 认证，浏览群组/项目/MR 层级结构
- **代码差异查看** - 内置 Diff 查看器，自动解析变更行号
- **AI 代码审查** - 基于 OpenAI 兼容 API，支持自定义审查规则和语言
- **多供应商支持** - 支持 OpenAI、GLM、OpenRouter 等 OpenAI 兼容服务

### 界面特性

- **三栏布局** - 左侧导航、中间 Diff、右侧 AI 审查面板
- **磨砂玻璃主题** - 现代化 UI 设计

## 安装说明

### macOS

由于应用未经 Apple 签名，首次安装后需执行以下命令：

```bash
xattr -cr /Applications/Open\ Reviewer.app
```

然后重新打开应用即可正常使用。

### Windows

直接运行安装包即可。


---
「开发者指南」
---


## 快速开始

### 环境要求

- Node.js 18+
- Rust (最新稳定版)
- macOS 10.13+ / Windows 10+

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发模式 (热重载)
npm run tauri:dev
```

### 生产构建

```bash
# macOS
npm run tauri:build

# Windows (使用专用配置)
npm run tauri:build:win
```


## 文档

- [样式规范](docs/style-guidelines.md)
- [CLAUDE.md](CLAUDE.md) - AI 开发指南

## License

MIT
