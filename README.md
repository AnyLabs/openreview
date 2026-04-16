# Open Reviewer

一个基于 Electron 的桌面应用程序，用于 GitLab Merge Request 的 AI 代码审查。

## 功能特性

### 核心功能

- **GitLab 集成** - 支持 Personal Access Token 认证，浏览群组/项目/MR 层级结构
- **代码差异查看** - 内置 Diff 查看器，自动解析变更行号
- **AI 代码审查** - 基于 OpenAI 兼容 API，支持自定义审查规则和语言
- **多供应商支持** - 支持 OpenAI、GLM、OpenRouter 等 OpenAI 兼容服务

### 界面特性

- **三栏布局** - 左侧导航、中间 Diff、右侧 AI 审查面板
- **现代化 UI** - 原子 CSS + CSS 变量系统，Dark Theme

## 安装说明

### macOS

由于应用未经 Apple 签名，首次安装后需执行以下命令：

```bash
xattr -cr /Applications/Open\ Reviewer.app
```

然后重新打开应用即可正常使用。

### Windows

直接运行安装包即可。

## 快速开始

### 环境要求

- Node.js 18+
- macOS 10.13+ / Windows 10+

### 开发模式

```bash
# 安装依赖
npm install

# 启动开发模式 (热重载)
npm run dev
```

### 生产构建

```bash
# 构建应用
npm run build

# 打包分发
npm run dist
```

### 开发自检清单

- 提交前建议至少执行一次：`npm run typecheck && npm run lint`
- 本地发版前建议执行：`npm run dist`
- Electron 渲染进程只通过 `window.desktop` 访问桌面能力，避免在 React 代码中直接引入 Node/Electron API

## 项目架构

### 技术栈

- **前端**: React 19 + TypeScript 5.8 + Vite 7
- **后端**: Electron (Node.js)
- **AI 集成**: 支持 OpenAI 兼容 API
- **样式**: 原子 CSS + CSS 变量系统，Dark Theme

### 目录结构

```
src/
├── components/ui/          # 可复用 UI 组件 (基于 Radix UI)
├── constants/              # 常量定义
├── contexts/               # React Context (全局状态)
├── desktop/                # Electron 桥接
├── features/               # 功能模块 (按业务拆分)
│   ├── ai/                 # AI 审查功能
│   ├── diff/               # 代码差异查看
│   ├── gitlab/             # GitLab 集成
│   ├── layout/             # 布局组件
│   └── settings/           # 设置功能
├── hooks/                  # 自定义 Hooks (useAppState, useAIReview 等)
├── lib/                    # 工具库
├── services/               # 业务逻辑层
│   ├── adapters/           # AI 适配器 (openai)
│   ├── gitlab.ts           # GitLab API 客户端 (单例)
│   ├── review-engine.ts    # 统一审查引擎
│   └── storage.ts          # 配置持久化
├── styles/                 # 全局样式 (CSS 变量)
├── types/                  # TypeScript 类型定义
└── App.tsx
```

### 核心架构模式

**1. 适配器模式 (AI 服务)**
- 入口: `src/services/review-engine.ts` - `executeReview()`
- `openai`: OpenAI 兼容 API (支持 GLM、OpenRouter 等)
- 接口定义: `src/services/adapters/types.ts` - `ProviderAdapter`

**2. 状态管理 (Context + Hooks)**
- `AppContext` (useAppState): 全局应用状态
  - GitLab 连接状态
  - 选中的群组/项目/MR
  - 当前选中的文件 (selectedFileIndex, selectedFileDiff)
- `FileAIReviewContext` (useFileAIReviewContext): 文件级 AI 审查状态
- `ThemeContext`: 主题管理

**3. 三栏布局系统**
- 左侧栏 (Sidebar): GitLab 导航 (群组/项目/MR)
- 主区域: Diff 查看器
- 右侧栏 (RightPanel): AI 审查 + 操作面板
- 布局比例: 1:3:1

**4. GitLab 集成**
- 单例客户端: `src/services/gitlab.ts` - `GitLabClient`
- 使用 Personal Access Token 认证
- 自动解析 diff 变更行号

### 数据流

```
用户操作 → UI 组件 → Hook → 服务层 → API
                    ↓
                Context 状态更新
                    ↓
                UI 自动重新渲染
```

## 样式规范 (强制)

参见 `docs/style-guidelines.md`，以下是关键约束：

1. **禁止未经许可添加 `box-shadow`**
2. **禁止用发光外描边模拟阴影效果**
3. **图标优先使用 lucide-react**，不满足时向用户确认
4. **AI 模型配置弹窗规则**:
   - 供应商与模型采用父子层级展示
   - 弹窗内只保留一层纵向滚动
   - "新增供应商"/"新增模型"表单同一时间最多显示一个
   - 入口统一放在左侧列表下方
   - 减少边框噪音，用留白、缩进和轻背景区分层级

### CSS 变量系统

定义在 `src/styles/base.css`:
- `--color-primary`: 品牌色 (#6366f1)
- `--bg-*`: 背景色系列
- `--border-*`: 边框色系列
- `--text-*`: 文字色系列
- `--glass-*`: 玻璃态效果

## 重要约定

### 唯一标识规范

供应商与模型的唯一标识已从 `name` 迁移为 `id`：
- `AIConfig.providerId` 对应 `AIProvider.id`
- `AIConfig.modelId` 对应 `ModelInfo.id`
- 全系统以 `id` 作为唯一键进行查找、匹配和删除
- UI 展示仍使用 `name` 作为显示名称

### 配置持久化

- Electron 环境: 文件系统
- Web 环境: localStorage
- 当前版本: V3
- 配置结构: `AppConfig` (包含 `gitlab` 和 `ai` 两部分)

### React 组件规范

- **函数组件优先**，使用 Hooks
- **TypeScript 强类型**，所有组件定义 Props 接口
- **单一职责原则**，复杂组件合理拆分
- **性能优化**: 合理使用 memo、useMemo、useCallback

### Git 提交规范

使用项目配置的 commit message 格式:
```
${branch} ${actionType}: ${message}
```
- branch: 当前分支名
- actionType: feat/refactor/fix/test 等
- message: 描述内容，20字左右，90字以内
- 基于已暂存的文件生成，不覆盖未暂存的变更

## 关键文件速查

| 文件 | 用途 |
|------|------|
| `src/services/review-engine.ts` | AI 审查统一入口 |
| `src/services/gitlab.ts` | GitLab API 客户端 |
| `src/hooks/useAppState.ts` | 全局状态管理 |
| `src/hooks/useFileAIReview.ts` | 文件级 AI 审查 |
| `src/services/adapters/` | AI 适配器实现 |
| `src/types/gitlab.ts` | GitLab 类型定义 |
| `src/styles/base.css` | CSS 变量系统 |

## 待实现功能

参见 `docs/plans/` 目录：
- Tauri Store Secrets 云同步迁移
- ACP 集成
- AI CLI OpenAI Robust 解耦

## 文档

- [样式规范](docs/style-guidelines.md)
- [功能规划](docs/feature.md)

## License

MIT
