# AI 代码审查功能

## 功能概述

实现与主视图联动的 AI 代码审查功能，支持对 MR 中的单个文件进行 AI 代码审查，并在文件下方显示审查结果和提交表单。

## 功能特性

### 1. 功能联动机制
- 当用户在主视图中选中任意文件时，右侧面板立即显示"执行代码审查"按钮
- 按钮状态根据文件选中状态实时更新
- 显示当前选中文件的文件名

### 2. 代码审查触发流程
- 用户点击"执行代码审查"按钮后，系统自动提取当前选中文件的 diff 数据
- 按照预设格式封装后发送至指定 AI 模型进行代码审查
- 支持 OpenAI 兼容 API

### 3. 审查结果展示
- AI 返回的代码审查结果追加显示在左侧面板中当前选中文件对应的 TogglePanel 底部区域
- 显示内容包括：
  - 审查总结
  - 详细评论列表（按严重程度分类：error/warning/info）
  - 评论提交富文本表单
- 结果内容完整且不覆盖原有 diff 信息

### 4. 评论提交功能
- 富文本编辑框支持 Markdown 格式
- 提供格式化工具栏（粗体、斜体、列表、代码块等）
- 支持编辑/预览两种模式
- 提交成功后显示成功提示

### 5. 用户体验优化
- AI 处理过程中显示加载状态提示（旋转动画）
- 处理完成后自动更新显示结果
- 文件选中状态有视觉标识（左侧边框高亮）
- 整个流程流畅直观，不阻塞用户其他操作

## 技术实现

### 核心组件

#### 1. useFileAIReview Hook
- 管理每个文件的 AI Review 状态（loading/result/error）
- 使用 Map 存储多个文件的审查状态
- 支持并发请求管理，避免重复请求

#### 2. FileAIReviewResult 组件
- 显示单个文件的 AI 审查结果
- 包含富文本编辑器和提交表单
- 支持 Markdown 预览

#### 3. FileDiff 组件增强
- 在 TogglePanel 底部添加 AI Review 结果区域
- 接收并显示对应文件的审查状态
- 支持文件选中状态样式

#### 4. RightPanel 组件增强
- 显示文件级"执行代码审查"按钮
- 实时反映当前选中文件状态
- 显示审查加载状态和错误信息

### 状态管理

#### AppState 扩展
```typescript
interface AppState {
  // ... 原有状态
  selectedFileIndex: number | null;  // 当前选中的文件索引
  selectedFileDiff: GitLabDiff | null;  // 当前选中的文件 diff
}

interface AppStateActions {
  // ... 原有操作
  selectFile: (index: number | null, diff: GitLabDiff | null) => void;
}
```

#### 唯一标识规范

供应商与模型的选中态标识已从 `name` 迁移为 `id`：

- `AIConfig.ProviderName` → `AIConfig.ProviderId`（对应 `AIProvider.id`）
- `AIConfig.ModelName` → `AIConfig.ModelId`（对应 `ModelInfo.id`）
- `ModelInfo.id` 已变为必填字段
- 全系统（类型定义、持久化、服务层、Hooks、UI 组件）均以 `id` 作为唯一键进行查找、匹配和删除
- UI 展示仍使用 `name` 作为显示名称

### 样式规范

#### 文件审查按钮区域（右侧面板）
- 背景色：var(--bg-panel)
- 边框：1px solid var(--border-subtle)
- 圆角：var(--radius-md)
- 文件名显示：单行省略，带文件图标

#### AI 审查结果区域（文件下方）
- 与 diff 内容区域分隔：上边框分隔
- 背景色：var(--bg-panel)
- 评论项左侧边框颜色按严重程度区分：
  - error: var(--color-error)
  - warning: var(--color-warning)
  - info: var(--color-info)

#### 富文本编辑器
- 工具栏：紧凑图标按钮布局
- 编辑框：等宽字体，支持 resize
- 预览区：标准 Markdown 渲染样式

## 文件变更清单

### 新建文件
- `src/hooks/useFileAIReview.ts` - 文件级 AI Review Hook
- `src/features/ai/components/FileAIReviewResult.tsx` - 文件级 AI Review 结果组件

### 修改文件
- `src/hooks/useAppState.ts` - 添加 selectedFileIndex 和 selectedFileDiff 状态
- `src/features/layout/components/MainContent.tsx` - 集成文件选择状态管理
- `src/features/layout/components/RightPanel.tsx` - 添加文件级审查按钮
- `src/features/diff/components/DiffViewer.tsx` - 管理文件选中状态和 AI Review 数据传递
- `src/features/diff/components/FileDiff.tsx` - 添加 AI Review 结果展示区域
- `src/styles/ai-review.css` - 添加文件级 AI Review 样式

## 使用流程

1. 用户在左侧 MR 列表选择一个 MR
2. 主内容区显示该 MR 的所有文件变更列表
3. 用户点击某个文件，文件被选中（显示高亮边框）
4. 右侧面板 AI 审查区域显示"执行代码审查"按钮和当前文件名
5. 用户点击按钮，系统发送 diff 数据到 AI 模型
6. 按钮显示加载状态，文件下方显示加载动画
7. AI 返回审查结果后，自动显示在文件下方的 TogglePanel 内
8. 用户可以在富文本编辑框中编辑审查意见
9. 点击"提交评论"按钮将意见提交到 GitLab MR

## 注意事项

1. AI 配置需要先完成（OpenAI API）
2. 文件级审查只针对当前选中的单个文件
3. 审查结果会缓存在内存中，切换文件不会丢失
4. 提交评论需要 GitLab 连接正常
