# Git 平台抽象层 + GitHub PR 支持实施方案

## Context

当前 Open Reviewer 仅支持 GitLab MR 代码审查，所有服务层、类型、Hooks、UI 组件均与 GitLab 强耦合。为扩展支持 GitHub Pull Request 审查能力，需要：
1. 抽象公共 Git 平台接口层（适配器模式）
2. 将现有 GitLab 逻辑迁移为适配器实现
3. 新增 GitHub 适配器（PAT 认证 + PR 全链路）
4. 多平台配置共存 + 切换机制

## 一、架构设计

### 1.1 新目录结构

```
src/
├── services/
│   ├── platform/                    # [新增] Git 平台抽象层
│   │   ├── types.ts                 # 平台适配器接口 + 通用类型
│   │   ├── factory.ts               # 平台客户端工厂（创建/切换/销毁）
│   │   ├── gitlab-adapter.ts        # GitLab 适配器（从 gitlab.ts 迁移）
│   │   └── github-adapter.ts        # [新增] GitHub 适配器
│   ├── gitlab.ts                    # [保留但标记 deprecated] 渐进迁移
│   └── ...（其他不变）
├── types/
│   ├── platform.ts                  # [新增] 平台无关的通用类型
│   └── gitlab.ts                    # [修改] 剥离通用类型，保留 GitLab 特有 + AI 类型
├── hooks/
│   ├── usePlatform.ts               # [新增] 替代 useGitLab.ts 的平台无关 hooks
│   ├── useAppState.ts               # [修改] 支持多平台配置 + activePlatform
│   └── ...
├── contexts/
│   ├── PlatformContext.tsx           # [新增] 平台客户端 Context
│   └── ...
├── features/
│   ├── platform/                    # [新增] 平台无关的导航组件
│   │   └── components/
│   │       ├── OrgList.tsx          # 组织/群组列表（复用 GroupTreeList 逻辑）
│   │       ├── RepoList.tsx         # 仓库/项目列表
│   │       └── ReviewList.tsx       # MR/PR 列表
│   ├── gitlab/components/           # [保留] GitLab 特有组件（如需要）
│   └── ...
```

### 1.2 平台适配器接口设计

**文件: `src/services/platform/types.ts`**

```typescript
/** 支持的平台类型 */
export type PlatformType = "gitlab" | "github";

/** 平台配置 */
export interface PlatformConfig {
  type: PlatformType;
  url: string;
  token: string;
}

/** 平台用户 */
export interface PlatformUser {
  id: number;
  username: string;
  name: string;
  avatarUrl?: string;
  webUrl?: string;
}

/** 组织/群组 */
export interface PlatformOrg {
  id: number;
  name: string;
  path: string;
  fullName: string;
  fullPath: string;
  description?: string;
  avatarUrl?: string;
  webUrl?: string;
  parentId?: number | null;
}

/** 仓库/项目 */
export interface PlatformRepo {
  id: number;
  name: string;
  fullName: string;       // path_with_namespace / full_name
  defaultBranch: string;
  description?: string;
  webUrl?: string;
  namespace?: { id: number; name: string; path: string };
}

/** Review 状态 */
export type ReviewState = "open" | "closed" | "merged" | "all";

/** Review（MR/PR）*/
export interface PlatformReview {
  id: number;
  iid: number;              // GitLab iid / GitHub number
  title: string;
  description?: string;
  state: ReviewState;
  sourceBranch: string;
  targetBranch: string;
  author: PlatformUser;
  webUrl?: string;
  createdAt: string;
  updatedAt: string;
  /** Diff 参考引用（GitLab: diff_refs, GitHub: base/head SHA） */
  diffRefs?: {
    baseSha: string;
    headSha: string;
    startSha: string;
  };
  /** 平台原始数据（供特定功能使用） */
  _raw?: unknown;
}

/** 文件变更 Diff */
export interface PlatformDiff {
  oldPath: string;
  newPath: string;
  diff: string;             // unified diff 内容
  newFile: boolean;
  renamedFile: boolean;
  deletedFile: boolean;
}

/** Review + 变更文件 */
export interface PlatformReviewWithChanges extends PlatformReview {
  changes: PlatformDiff[];
}

/** 讨论/评论位置 */
export interface CommentPosition {
  oldPath?: string;
  newPath?: string;
  oldLine?: number | null;
  newLine?: number | null;
}

/** 讨论评论 */
export interface PlatformCommentNote {
  id: number | string;
  body: string;
  authorName: string;
  authorAvatarUrl?: string;
  createdAt: string;
  system: boolean;
  resolved?: boolean;
}

/** 讨论线程 */
export interface PlatformDiscussion {
  id: string;
  notes: PlatformCommentNote[];
  position?: CommentPosition;
  resolved?: boolean;
}

/** 提交作者信息 */
export interface CommitAuthorInfo {
  commitId: string;
  authorName: string;
  title: string;
  createdAt: string;
  webUrl?: string;
}

/** 文件行级最新提交者 */
export interface FileLineCommitters {
  additions: Record<number, CommitAuthorInfo>;
  deletions: Record<number, CommitAuthorInfo>;
}

/** 合并策略 */
export type MergeStrategy = "immediate" | "pipeline";

/** 合并选项 */
export interface MergeOptions {
  strategy?: MergeStrategy;
  shouldRemoveSourceBranch?: boolean;
  squash?: boolean;
}

/** 发表评论参数 */
export interface PostCommentParams {
  repoId: number;
  reviewIid: number;
  body: string;
  position?: CommentPosition & {
    baseSha?: string;
    headSha?: string;
    startSha?: string;
  };
}

/**
 * Git 平台适配器接口
 * 所有平台实现需遵循此契约
 */
export interface PlatformAdapter {
  /** 平台类型标识 */
  readonly type: PlatformType;

  /** 验证连接（获取当前用户） */
  getCurrentUser(): Promise<PlatformUser>;

  /** 获取组织/群组列表 */
  getOrgs(): Promise<PlatformOrg[]>;

  /** 获取子组织（GitLab subgroups, GitHub 不需要可返回空） */
  getSubOrgs(orgId: number): Promise<PlatformOrg[]>;

  /** 获取组织下的仓库 */
  getOrgRepos(orgId: number): Promise<PlatformRepo[]>;

  /** 获取用户所有仓库 */
  getRepos(): Promise<PlatformRepo[]>;

  /** 获取 Review（MR/PR）列表 */
  getReviews(repoId: number, state?: ReviewState): Promise<PlatformReview[]>;

  /** 获取 Review 详情 + 变更文件 */
  getReviewWithChanges(repoId: number, reviewIid: number): Promise<PlatformReviewWithChanges>;

  /** 获取 Review 讨论/评论 */
  getReviewDiscussions(repoId: number, reviewIid: number): Promise<PlatformDiscussion[]>;

  /** 获取 Review 的文件行级提交者信息 */
  getReviewAuthorData(repoId: number, reviewIid: number): Promise<{
    fileAuthors: Record<string, string[]>;
    lineCommitters: Record<string, FileLineCommitters>;
  }>;

  /** 获取文件内容 */
  getFileContent(repoId: number, filePath: string, ref: string): Promise<string>;

  /** 发表评论 */
  postComment(params: PostCommentParams): Promise<void>;

  /** 合并 Review */
  mergeReview(repoId: number, reviewIid: number, options?: MergeOptions): Promise<void>;
}
```

### 1.3 平台概念映射

| 通用概念 | GitLab | GitHub |
|---------|--------|--------|
| PlatformOrg | Group | Organization |
| PlatformRepo | Project | Repository |
| PlatformReview | Merge Request | Pull Request |
| Review 编号前缀 | `!` | `#` |
| ReviewState.open | `opened` | `open` |
| 认证 Header | `PRIVATE-TOKEN` | `Authorization: Bearer` |
| API 前缀 | `/api/v4` | `api.github.com` 或 `/api/v3` (GHE) |
| 讨论 | Discussions (notes) | Review Comments + Issue Comments |
| 行级评论 | Discussion with position | Pull Request Review Comment |

## 二、实施步骤（分 6 批）

### 第 1 批：类型系统 + 平台接口（基础层）

**目标**: 建立平台无关的类型系统和适配器接口

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/types/platform.ts` | 通用平台类型（PlatformOrg, PlatformRepo, PlatformReview, PlatformDiff 等） |
| 新增 | `src/services/platform/types.ts` | PlatformAdapter 接口定义 + PlatformConfig |
| 新增 | `src/services/platform/factory.ts` | 平台客户端工厂：`createPlatformAdapter(config)`, 活跃实例管理 |
| 修改 | `src/types/gitlab.ts` | AppConfig 演进：增加 `github: GitHubConfig`, `activePlatform: PlatformType`；保留 GitLab 原有类型 |
| 修改 | `src/services/net/errors.ts` | `ServiceError.provider` 联合类型增加 `"gitlab" \| "github"` |
| 修改 | `src/services/net/http-client.ts` | `RequestOptions.provider` 联合类型同步增加 |

### 第 2 批：GitLab 适配器迁移

**目标**: 将现有 GitLabClient 逻辑封装为 PlatformAdapter 实现

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/services/platform/gitlab-adapter.ts` | 实现 PlatformAdapter 接口，内部逻辑从 `gitlab.ts` 迁移，使用统一 HTTP 客户端 |
| 修改 | `src/services/gitlab.ts` | 改为薄封装层，内部委托给 gitlab-adapter，保持已有导出 API 不变（向后兼容） |

**关键**: gitlab-adapter 内部完成 GitLab API 类型 → PlatformXxx 类型的转换。例如：
- `GitLabGroup` → `PlatformOrg`（`full_name` → `fullName`, `parent_id` → `parentId`）
- `GitLabMergeRequest` → `PlatformReview`（`state: "opened"` → `"open"`, `iid` 保持）
- `GitLabDiff` → `PlatformDiff`（`old_path` → `oldPath`, `new_file` → `newFile`）

### 第 3 批：GitHub 适配器实现

**目标**: 实现 GitHub PAT 认证 + PR 全链路

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/services/platform/github-adapter.ts` | GitHub PlatformAdapter 完整实现 |

**GitHub 适配器关键实现细节**:

1. **认证**: `Authorization: Bearer <token>` 或 `token <token>` header
2. **API 基础 URL**:
   - github.com → `https://api.github.com`
   - GitHub Enterprise → `https://<host>/api/v3`
3. **组织列表**: `GET /user/orgs` → PlatformOrg
4. **仓库列表**:
   - 组织仓库: `GET /orgs/{org}/repos`
   - 用户仓库: `GET /user/repos?affiliation=owner,collaborator,organization_member`
5. **PR 列表**: `GET /repos/{owner}/{repo}/pulls?state={state}`
6. **PR 详情 + Diff**:
   - `GET /repos/{owner}/{repo}/pulls/{number}` 获取 PR 详情
   - `GET /repos/{owner}/{repo}/pulls/{number}/files` 获取变更文件列表
   - 每个文件的 `patch` 字段即为 unified diff
7. **评论/讨论**:
   - `GET /repos/{owner}/{repo}/pulls/{number}/comments` 行级 review comments
   - `GET /repos/{owner}/{repo}/issues/{number}/comments` 普通评论
   - 转换为统一 PlatformDiscussion 格式
8. **发表评论**:
   - 行级: `POST /repos/{owner}/{repo}/pulls/{number}/comments` with `commit_id`, `path`, `line`, `side`
   - 普通: `POST /repos/{owner}/{repo}/issues/{number}/comments`
9. **合并 PR**: `PUT /repos/{owner}/{repo}/pulls/{number}/merge`
10. **文件内容**: `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` (Base64) 或 raw media type
11. **提交作者数据**:
    - `GET /repos/{owner}/{repo}/pulls/{number}/commits`
    - 每个 commit: `GET /repos/{owner}/{repo}/commits/{sha}` 获取 files (patch)

**GitHub 特有注意事项**:
- GitHub API 分页使用 `Link` header（`rel="next"`），需实现通用分页器
- GitHub repo 标识使用 `owner/repo` 字符串，不是数字 ID（但 API 也支持 repo ID）
- PR state 只有 `open`/`closed`，merged 通过 `merged` 布尔字段判断
- 需要存储 `owner/repo` 到 `PlatformRepo.fullName`，适配器内部解析使用

### 第 4 批：状态管理 + 配置存储演进

**目标**: 支持多平台配置共存和切换

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/types/gitlab.ts` | `AppConfig` 增加 `github: GitHubConfig`, `activePlatform` |
| 修改 | `src/services/storage.ts` | V3 → V4 迁移：profile 增加 `githubUrl`, secrets 增加 `githubToken`, 增加 `activePlatform` |
| 修改 | `src/hooks/useAppState.ts` | 状态增加 `activePlatform`; `updateGitLabConfig` 保留, 增加 `updateGitHubConfig`, `switchPlatform`; 选中状态类型改为 Platform 通用类型 |
| 新增 | `src/contexts/PlatformContext.tsx` | 提供当前活跃的 PlatformAdapter 实例 |
| 新增 | `src/hooks/usePlatform.ts` | 平台无关的数据获取 hooks: `useOrgs`, `useRepos`, `useReviews`, `useReviewChanges`, `useReviewMergeAction` |
| 修改 | `src/hooks/useFileAIReview.ts` | `GitLabDiff` 参数改为 `PlatformDiff` |

**AppConfig 演进**:
```typescript
export interface GitHubConfig {
  url: string;    // 默认 https://github.com
  token: string;
}

export interface AppConfig {
  activePlatform: PlatformType;  // "gitlab" | "github"
  gitlab: GitLabConfig;
  github: GitHubConfig;
  ai: AIConfig;
}
```

**存储 V4 Schema**:
```typescript
interface AppConfigStoreV4 {
  schemaVersion: 4;
  profile: {
    activePlatform: PlatformType;
    gitlabUrl: string;
    githubUrl: string;          // 新增
    providerId?, modelId?, modeProviders, language, rules, theme
  };
  secrets: {
    providerApiKeys?: Record<string, StoredSecret>;
    gitlabToken?: StoredSecret;
    githubToken?: StoredSecret;  // 新增
  };
  sync: { ... };
  meta: { ... };
}
```

**AppState 演进**:
```typescript
export interface AppState {
  config: AppConfig;
  activePlatform: PlatformType;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  selectedOrg: PlatformOrg | null;       // 原 selectedGroup
  selectedRepo: PlatformRepo | null;     // 原 selectedProject
  selectedReview: PlatformReview | null; // 原 selectedMR
  selectedFileIndex: number | null;
  selectedFileDiff: PlatformDiff | null; // 原 GitLabDiff
}
```

### 第 5 批：UI 组件适配

**目标**: 组件支持多平台展示，根据 activePlatform 切换文案和行为

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/constants/platform-labels.ts` | 平台文案映射（MR/PR, !/# 等） |
| 修改 | `src/features/layout/components/Sidebar.tsx` | 使用 `usePlatform` hooks 替代 `useGitLab`；面板标题动态化 |
| 修改 | `src/features/layout/components/MainContent.tsx` | PlatformDiff 替代 GitLabDiff；Review 编号前缀动态化 |
| 修改 | `src/features/layout/components/RightPanel.tsx` | 连接状态标签动态化；合并操作适配 |
| 修改 | `src/features/diff/components/DiffViewer.tsx` | 通过 PlatformContext 获取客户端替代 `getGitLabClient()`；类型替换 |
| 修改 | `src/features/diff/components/FileDiff.tsx` | PlatformDiff 替代 GitLabDiff；讨论组件类名通用化 |
| 修改 | `src/features/diff/types/gitlabComments.ts` | 重命名为 `reviewComments.ts`，接受 PlatformDiscussion 输入 |
| 修改 | `src/features/settings/components/SettingsForm.tsx` | 增加平台切换选择 + GitHub 配置表单 |
| 修改 | `src/features/settings/settingsSchemas.ts` | 增加 GitHub URL/Token 校验 schema |
| 修改 | `src/features/gitlab/components/GroupTreeList.tsx` | 类型从 GitLabGroup 改为 PlatformOrg |
| 修改 | `src/features/gitlab/components/ProjectList.tsx` | 类型改为 PlatformRepo |
| 修改 | `src/features/gitlab/components/MRList.tsx` | 类型改为 PlatformReview；编号前缀动态化 |
| 修改 | `src/features/ai/components/FileAIReviewResult.tsx` | "GitLab 评论" 改为动态平台名 |
| 修改 | `src/App.tsx` | 嵌套 PlatformProvider |

**平台文案映射** (`src/constants/platform-labels.ts`):
```typescript
export const PLATFORM_LABELS = {
  gitlab: {
    name: "GitLab",
    org: "群组",
    repo: "项目",
    review: "合并请求",
    reviewShort: "MR",
    reviewPrefix: "!",
    tokenPlaceholder: "glpat-xxxxxxxxxxxx",
    defaultUrl: "https://gitlab.com",
  },
  github: {
    name: "GitHub",
    org: "组织",
    repo: "仓库",
    review: "Pull Request",
    reviewShort: "PR",
    reviewPrefix: "#",
    tokenPlaceholder: "ghp_xxxxxxxxxxxx",
    defaultUrl: "https://github.com",
  },
} as const;
```

### 第 6 批：集成测试 + 清理

**目标**: 确保两个平台都能正常工作，清理废弃代码

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/hooks/useGitLab.ts` | 标记 deprecated，内部委托 usePlatform |
| 删除 | `src/features/gitlab/components/GroupList.tsx` | 已被 GroupTreeList 替代的废弃组件 |
| 修改 | `src/services/gitlab.ts` | 确认所有调用方已迁移后可标记 deprecated |
| 验证 | 全局 | `npm run typecheck` + `npm run lint` 通过 |
| 验证 | 手动 | GitLab 流程回归测试（群组→项目→MR→Diff→评论→合并） |
| 验证 | 手动 | GitHub 流程测试（组织→仓库→PR→Diff→评论→合并） |

## 三、关键设计决策

### 3.1 渐进迁移 vs 一步到位
**选择渐进迁移**。保留 `gitlab.ts` 作为薄封装层向后兼容，新代码通过 PlatformAdapter 接口调用。这样可以分批提交、逐步验证，降低大范围重构风险。

### 3.2 统一 HTTP 客户端
GitHub 适配器使用 `src/services/net/http-client.ts` 统一 HTTP 客户端（含超时 + 重试），不再像旧 GitLabClient 那样直接使用原生 fetch。GitLab 适配器迁移时也改用统一 HTTP 客户端。

### 3.3 GitHub 分页策略
GitHub API 使用 `Link` header 分页。在 github-adapter 内部实现一个通用分页辅助函数 `fetchAllPages<T>(url)`，自动跟随 `rel="next"` 链接直到没有下一页。设置合理的 per_page（100）和最大页数限制（10 页）。

### 3.4 GitHub owner/repo 标识
GitHub API 路由使用 `owner/repo` 字符串。适配器内部通过 `PlatformRepo.fullName`（对应 GitHub 的 `full_name`，格式为 `owner/repo`）解析。接口方法签名中的 `repoId: number` 在 GitHub 实现中可以使用 repo 数字 ID（GitHub API 也支持），或者通过额外的映射表转换。**推荐使用数字 ID**，因为 GitHub REST API 完全支持 `GET /repositories/{id}` 系列端点。

### 3.5 Diff 解析统一
当前有两份 diff 解析函数（`gitlab.ts` 的 `parseDiffChangedLines` 和 `DiffViewer.tsx` 的 `parseChangedLines`）。在平台抽象层中统一为一个 `src/services/platform/diff-utils.ts`，导出 `parseDiffChangedLines()` 供所有场景使用。

## 四、涉及的关键文件清单

### 新增文件（9 个）
- `src/types/platform.ts`
- `src/services/platform/types.ts`
- `src/services/platform/factory.ts`
- `src/services/platform/gitlab-adapter.ts`
- `src/services/platform/github-adapter.ts`
- `src/services/platform/diff-utils.ts`
- `src/constants/platform-labels.ts`
- `src/contexts/PlatformContext.tsx`
- `src/hooks/usePlatform.ts`

### 修改文件（约 18 个）
- `src/types/gitlab.ts` — AppConfig 演进
- `src/services/storage.ts` — V4 schema + 迁移
- `src/services/gitlab.ts` — 薄封装层
- `src/services/net/errors.ts` — provider 类型扩展
- `src/services/net/http-client.ts` — provider 类型扩展
- `src/hooks/useAppState.ts` — 多平台状态
- `src/hooks/useGitLab.ts` — deprecated 委托
- `src/hooks/useFileAIReview.ts` — PlatformDiff 类型
- `src/App.tsx` — 增加 PlatformProvider
- `src/features/layout/components/Sidebar.tsx`
- `src/features/layout/components/MainContent.tsx`
- `src/features/layout/components/RightPanel.tsx`
- `src/features/diff/components/DiffViewer.tsx`
- `src/features/diff/components/FileDiff.tsx`
- `src/features/diff/types/gitlabComments.ts` → `reviewComments.ts`
- `src/features/settings/components/SettingsForm.tsx`
- `src/features/settings/settingsSchemas.ts`
- `src/features/gitlab/components/GroupTreeList.tsx`
- `src/features/gitlab/components/ProjectList.tsx`
- `src/features/gitlab/components/MRList.tsx`
- `src/features/ai/components/FileAIReviewResult.tsx`

## 五、验证方案

1. **类型检查**: `npm run typecheck` 无错误
2. **代码检查**: `npm run lint` 无错误
3. **GitLab 回归**: 完整流程（连接 → 群组 → 项目 → MR → Diff → AI 审查 → 评论 → 合并）
4. **GitHub 新功能**: 完整流程（连接 → 组织 → 仓库 → PR → Diff → AI 审查 → 评论 → 合并）
5. **平台切换**: 设置中切换 GitLab/GitHub 后导航和数据正确刷新
6. **配置持久化**: 关闭重开后两个平台的配置（URL/Token）均正确恢复
7. **构建**: `npm run tauri:build` 成功
