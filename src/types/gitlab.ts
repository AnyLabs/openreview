/**
 * GitLab 相关类型定义
 */

import type { PlatformType } from "./platform";


/** GitLab 用户 */
export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
  web_url: string;
}

/** GitLab 群组 */
export interface GitLabGroup {
  id: number | string;
  name: string;
  path: string;
  full_name: string;
  full_path: string;
  description: string;
  avatar_url: string | null;
  web_url: string;
  parent_id: number | null;
}

/** GitLab 项目 */
export interface GitLabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string;
  avatar_url: string | null;
  web_url: string;
  default_branch: string;
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: string;
    full_path: string;
  };
}

/** MR 状态 */
export type MRState = "opened" | "closed" | "merged" | "all";

/** MR 合并策略 */
export type MergeStrategy = "immediate" | "pipeline";

/** GitLab Merge Request */
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: "opened" | "closed" | "merged";
  source_branch: string;
  target_branch: string;
  author: GitLabUser;
  assignees: GitLabUser[];
  reviewers: GitLabUser[];
  web_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  diff_refs: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
  changes_count: string;
  user_notes_count: number;
}

/** MR 变更文件 */
export interface GitLabDiff {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

/** MR 讨论定位信息 */
export interface GitLabDiscussionPosition {
  base_sha?: string;
  start_sha?: string;
  head_sha?: string;
  old_path?: string;
  new_path?: string;
  old_line?: number;
  new_line?: number;
  position_type?: "text" | "image" | string;
}

/** MR 讨论中的单条评论 */
export interface GitLabDiscussionNote {
  id: number;
  body: string;
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  system?: boolean;
  resolvable?: boolean;
  resolved?: boolean;
  position?: GitLabDiscussionPosition | null;
}

/** MR 讨论线程 */
export interface GitLabMergeRequestDiscussion {
  id: string;
  individual_note: boolean;
  notes: GitLabDiscussionNote[];
}

/** MR 详情（包含变更） */
export interface GitLabMergeRequestWithChanges extends GitLabMergeRequest {
  changes: GitLabDiff[];
}

/** MR 合并参数 */
export interface GitLabMergeRequestMergeOptions {
  /** true 时由 GitLab 在流水线通过后自动合并 */
  mergeWhenPipelineSucceeds?: boolean;
  /** 是否在合并后删除源分支 */
  shouldRemoveSourceBranch?: boolean;
  /** 是否压缩提交 */
  squash?: boolean;
}

/** GitLab 配置 */
export interface GitLabConfig {
  /** GitLab 服务器地址 */
  url: string;
  /** Personal Access Token */
  token: string;
}

/** GitHub 配置 */
export interface GitHubConfig {
  /** GitHub 服务器地址（默认 https://github.com） */
  url: string;
  /** Personal Access Token */
  token: string;
}


/** 模型信息 */
export interface ModelInfo {
  /** 模型名称 */
  name: string;
  /** 模型 ID（唯一标识，用于接口调用） */
  id: string;
  /** 模型描述 */
  description?: string;
  /** 最大输入 Token */
  maxInputToken?: number;
  /** 最大上下文 Token */
  maxContextToken?: number;
  /** 其他扩展信息 */
  [key: string]: unknown;
}

/** AI 供应商配置 */
export interface AIProvider {
  /** 供应商名称 */
  name: string;
  /** 供应商 ID（唯一标识） */
  id: string;
  /** OpenAI 兼容 API 地址 */
  apiUrl?: string;
  /** OpenAI 兼容 API Key */
  apiKey?: string;
  /** 供应商下模型列表 */
  models: ModelInfo[];
}

/** AI 供应商列表 */
export type AIProviderList = AIProvider[];

/** AI 配置 */
export interface AIConfig {
  /** 当前选中的供应商 ID（对应 AIProvider.id） */
  providerId?: string;
  /** 当前选中的模型 ID（对应 ModelInfo.id） */
  modelId?: string;
  /** 模型供应商列表 */
  modeProviders: AIProviderList;
  /** 评审语言 */
  language: string;
  /** 自定义规则 */
  rules: string[];
}

/** 应用配置 */
export interface AppConfig {
  /** 当前活跃平台 */
  activePlatform: PlatformType;
  gitlab: GitLabConfig;
  github: GitHubConfig;
  ai: AIConfig;
}
