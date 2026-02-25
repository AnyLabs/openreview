/**
 * 平台无关的通用类型定义
 * 所有 Git 平台（GitLab / GitHub）的公共数据模型
 */

/** 支持的平台类型 */
export type PlatformType = "gitlab" | "github";

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
  id: number | string;
  name: string;
  path: string;
  fullName: string;
  fullPath: string;
  description?: string;
  avatarUrl?: string;
  webUrl?: string;
  parentId?: number | string | null;
  /** 子组织（用于树形展示，非 API 返回） */
  children?: PlatformOrg[];
}

/** 仓库/项目 */
export interface PlatformRepo {
  id: number;
  name: string;
  /** GitLab: path_with_namespace, GitHub: full_name (owner/repo) */
  fullName: string;
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
  /** GitLab iid / GitHub number */
  iid: number;
  title: string;
  description?: string;
  state: ReviewState;
  sourceBranch: string;
  targetBranch: string;
  author: PlatformUser;
  webUrl?: string;
  createdAt: string;
  updatedAt: string;
  /** Diff 参考引用 */
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
  /** unified diff 内容 */
  diff: string;
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


/**
 * 合并策略（平台特定语义）
 * - GitLab: "immediate" = 立即合并, "pipeline" = 等 pipeline 成功后合并
 * - GitHub: "merge" = 标准合并, "squash" = squash 合并, "rebase" = rebase 合并
 */
export type MergeStrategy = "immediate" | "pipeline" | "merge" | "squash" | "rebase";

/** 合并选项 */
export interface MergeOptions {
  /** 合并策略（平台特定，见 MergeStrategy 说明） */
  strategy?: MergeStrategy;
  /** 是否删除源分支（GitLab: should_remove_source_branch, GitHub: 由仓库设置控制） */
  shouldRemoveSourceBranch?: boolean;
  /** 是否使用 squash 合并（仅 GitLab，GitHub 使用 strategy="squash"） */
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
