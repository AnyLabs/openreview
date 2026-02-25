/**
 * Git 平台适配器接口定义
 * 所有平台实现需遵循此契约
 */

import type {
  PlatformType,
  PlatformUser,
  PlatformOrg,
  PlatformRepo,
  PlatformReview,
  PlatformReviewWithChanges,
  PlatformDiscussion,
  PlatformDiff,
  ReviewState,
  FileLineCommitters,
  MergeOptions,
  PostCommentParams,
} from "../../types/platform";

/** 平台连接配置 */
export interface PlatformConfig {
  type: PlatformType;
  url: string;
  token: string;
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
  getSubOrgs(orgId: number | string): Promise<PlatformOrg[]>;

  /** 获取组织下的仓库 */
  getOrgRepos(orgId: number | string): Promise<PlatformRepo[]>;

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

// 重新导出类型以便使用方统一从此处导入
export type {
  PlatformType,
  PlatformUser,
  PlatformOrg,
  PlatformRepo,
  PlatformReview,
  PlatformReviewWithChanges,
  PlatformDiscussion,
  PlatformDiff,
  ReviewState,
  FileLineCommitters,
  MergeOptions,
  PostCommentParams,
};
