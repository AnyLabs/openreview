/**
 * GitLab 平台适配器
 * 实现 PlatformAdapter 接口，封装 GitLab API 调用
 */

import type {
  PlatformAdapter,
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
} from "./types";
import type { CommitAuthorInfo } from "../../types/platform";
import { request as httpRequest } from "../net/http-client";
import { parseDiffChangedLines } from "./diff-utils";

/** GitLab API 原始类型（snake_case） */
interface GitLabUserRaw {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
  web_url: string;
}

interface GitLabGroupRaw {
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

interface GitLabProjectRaw {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string;
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

interface GitLabMRRaw {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: "opened" | "closed" | "merged";
  source_branch: string;
  target_branch: string;
  author: GitLabUserRaw;
  web_url: string;
  created_at: string;
  updated_at: string;
  diff_refs: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
}

interface GitLabDiffRaw {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

interface GitLabDiscussionNoteRaw {
  id: number;
  body: string;
  author: GitLabUserRaw;
  created_at: string;
  updated_at: string;
  system?: boolean;
  resolvable?: boolean;
  resolved?: boolean;
  position?: {
    old_path?: string;
    new_path?: string;
    old_line?: number;
    new_line?: number;
    position_type?: string;
  } | null;
}

interface GitLabDiscussionRaw {
  id: string;
  individual_note: boolean;
  notes: GitLabDiscussionNoteRaw[];
}

interface GitLabCommitRaw {
  id: string;
  author_name: string;
  created_at: string;
  title: string;
  web_url?: string;
}

interface GitLabCommitDiffFileRaw {
  old_path: string;
  new_path: string;
  diff?: string;
}

// ============ 类型转换函数 ============

function toUser(raw: GitLabUserRaw): PlatformUser {
  return {
    id: raw.id,
    username: raw.username,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    webUrl: raw.web_url,
  };
}

function toOrg(raw: GitLabGroupRaw): PlatformOrg {
  return {
    id: raw.id,
    name: raw.name,
    path: raw.path,
    fullName: raw.full_name,
    fullPath: raw.full_path,
    description: raw.description || undefined,
    avatarUrl: raw.avatar_url || undefined,
    webUrl: raw.web_url,
    parentId: raw.parent_id,
  };
}

function toRepo(raw: GitLabProjectRaw): PlatformRepo {
  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.path_with_namespace,
    defaultBranch: raw.default_branch,
    description: raw.description || undefined,
    webUrl: raw.web_url,
    namespace: raw.namespace
      ? { id: raw.namespace.id, name: raw.namespace.name, path: raw.namespace.path }
      : undefined,
  };
}

/** 将 GitLab state 映射为统一 ReviewState */
function toReviewState(state: "opened" | "closed" | "merged"): ReviewState {
  if (state === "opened") return "open";
  return state;
}

function toReview(raw: GitLabMRRaw): PlatformReview {
  return {
    id: raw.id,
    iid: raw.iid,
    title: raw.title,
    description: raw.description || undefined,
    state: toReviewState(raw.state),
    sourceBranch: raw.source_branch,
    targetBranch: raw.target_branch,
    author: toUser(raw.author),
    webUrl: raw.web_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    diffRefs: raw.diff_refs
      ? {
          baseSha: raw.diff_refs.base_sha,
          headSha: raw.diff_refs.head_sha,
          startSha: raw.diff_refs.start_sha,
        }
      : undefined,
    _raw: raw,
  };
}

function toDiff(raw: GitLabDiffRaw): PlatformDiff {
  return {
    oldPath: raw.old_path,
    newPath: raw.new_path,
    diff: raw.diff,
    newFile: raw.new_file,
    renamedFile: raw.renamed_file,
    deletedFile: raw.deleted_file,
  };
}

function toDiscussion(raw: GitLabDiscussionRaw): PlatformDiscussion {
  const firstNoteWithPosition = raw.notes.find((note) => note.position);
  const position = firstNoteWithPosition?.position;

  return {
    id: raw.id,
    notes: raw.notes.map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.author?.name || note.author?.username || "未知用户",
      authorAvatarUrl: note.author?.avatar_url || undefined,
      createdAt: note.created_at,
      system: note.system ?? false,
      resolved: note.resolved,
    })),
    position: position
      ? {
          oldPath: position.old_path,
          newPath: position.new_path,
          oldLine: position.old_line ?? null,
          newLine: position.new_line ?? null,
        }
      : undefined,
    resolved: raw.notes.some((note) => note.resolved === true),
  };
}

/** 将统一 ReviewState 映射回 GitLab state */
function toGitLabState(state?: ReviewState): string {
  if (!state || state === "all") return "";
  if (state === "open") return "opened";
  return state;
}

/**
 * GitLab 平台适配器
 */
class GitLabAdapter implements PlatformAdapter {
  readonly type = "gitlab" as const;
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  /** 发起 API 请求（使用统一 HTTP 客户端） */
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/v4${endpoint}`;

    // 合并 headers（处理 Headers 对象类型）
    const mergedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": this.token,
    };

    if (options?.headers) {
      const headers = options.headers as Record<string, string>;
      Object.assign(mergedHeaders, headers);
    }

    return httpRequest<T>({
      url,
      method: options?.method as "GET" | "POST" || "GET",
      headers: mergedHeaders,
      body: options?.body,
      platform: "gitlab",
      retry: {
        maxRetries: 2,
        baseDelayMs: 1000,
      },
    });
  }

  async getCurrentUser(): Promise<PlatformUser> {
    const raw = await this.request<GitLabUserRaw>("/user");
    return toUser(raw);
  }

  async getOrgs(): Promise<PlatformOrg[]> {
    const raw = await this.request<GitLabGroupRaw[]>(
      "/groups?min_access_level=30&per_page=100"
    );
    return raw.map(toOrg);
  }

  async getSubOrgs(orgId: number | string): Promise<PlatformOrg[]> {
    const raw = await this.request<GitLabGroupRaw[]>(
      `/groups/${orgId}/subgroups?min_access_level=30&per_page=100`
    );
    return raw.map(toOrg);
  }

  async getOrgRepos(orgId: number | string): Promise<PlatformRepo[]> {
    const raw = await this.request<GitLabProjectRaw[]>(
      `/groups/${orgId}/projects?min_access_level=30&per_page=100&include_subgroups=true`
    );
    return raw.map(toRepo);
  }

  async getRepos(): Promise<PlatformRepo[]> {
    const raw = await this.request<GitLabProjectRaw[]>(
      "/projects?membership=true&min_access_level=30&per_page=100"
    );
    return raw.map(toRepo);
  }

  async getReviews(repoId: number, state?: ReviewState): Promise<PlatformReview[]> {
    const gitlabState = toGitLabState(state);
    const stateParam = gitlabState ? `&state=${gitlabState}` : "";
    const raw = await this.request<GitLabMRRaw[]>(
      `/projects/${repoId}/merge_requests?per_page=50${stateParam}`
    );
    return raw.map(toReview);
  }

  async getReviewWithChanges(repoId: number, reviewIid: number): Promise<PlatformReviewWithChanges> {
    const mrRaw = await this.request<GitLabMRRaw>(
      `/projects/${repoId}/merge_requests/${reviewIid}`
    );
    const diffsRaw = await this.request<GitLabDiffRaw[]>(
      `/projects/${repoId}/merge_requests/${reviewIid}/diffs`
    );

    return {
      ...toReview(mrRaw),
      changes: Array.isArray(diffsRaw) ? diffsRaw.map(toDiff) : [],
    };
  }

  async getReviewDiscussions(repoId: number, reviewIid: number): Promise<PlatformDiscussion[]> {
    const raw = await this.request<GitLabDiscussionRaw[]>(
      `/projects/${repoId}/merge_requests/${reviewIid}/discussions?per_page=100`
    );
    return raw.map(toDiscussion);
  }

  async getReviewAuthorData(repoId: number, reviewIid: number): Promise<{
    fileAuthors: Record<string, string[]>;
    lineCommitters: Record<string, FileLineCommitters>;
  }> {
    const rawCommits = await this.request<GitLabCommitRaw[]>(
      `/projects/${repoId}/merge_requests/${reviewIid}/commits?per_page=100`
    );
    const commits = [...rawCommits].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    );

    const fileAuthorMap = new Map<string, Set<string>>();
    const lineCommitters: Record<string, FileLineCommitters> = {};

    await Promise.all(
      commits.map(async (commit) => {
        const commitDiffs = await this.request<GitLabCommitDiffFileRaw[]>(
          `/projects/${repoId}/repository/commits/${commit.id}/diff?per_page=100`
        );
        const authorName = commit.author_name?.trim();
        if (!authorName) return;

        const commitInfo: CommitAuthorInfo = {
          commitId: commit.id,
          authorName,
          title: commit.title || "无标题提交",
          createdAt: commit.created_at,
          webUrl: commit.web_url,
        };

        for (const changedFile of commitDiffs) {
          const filePath = changedFile.new_path || changedFile.old_path;
          if (!filePath) continue;

          if (!fileAuthorMap.has(filePath)) {
            fileAuthorMap.set(filePath, new Set<string>());
          }
          fileAuthorMap.get(filePath)?.add(authorName);

          if (!lineCommitters[filePath]) {
            lineCommitters[filePath] = { additions: {}, deletions: {} };
          }

          const changedLines = parseDiffChangedLines(changedFile.diff || "");
          const fileLineAuthors = lineCommitters[filePath];

          for (const lineNumber of changedLines.additions) {
            fileLineAuthors.additions[lineNumber] = commitInfo;
          }
          for (const lineNumber of changedLines.deletions) {
            fileLineAuthors.deletions[lineNumber] = commitInfo;
          }
        }
      })
    );

    return {
      fileAuthors: Object.fromEntries(
        Array.from(fileAuthorMap.entries()).map(([filePath, authors]) => [
          filePath,
          Array.from(authors),
        ])
      ),
      lineCommitters,
    };
  }

  async getFileContent(repoId: number, filePath: string, ref: string): Promise<string> {
    const encodedPath = encodeURIComponent(filePath);
    const response = await fetch(
      `${this.baseUrl}/api/v4/projects/${repoId}/repository/files/${encodedPath}/raw?ref=${ref}`,
      {
        headers: { "PRIVATE-TOKEN": this.token },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    return response.text();
  }

  async postComment(params: PostCommentParams): Promise<void> {
    const { repoId, reviewIid, body, position } = params;

    const hasPath = Boolean(position?.oldPath || position?.newPath);
    const hasLine = [position?.oldLine, position?.newLine].some(
      (value) => typeof value === "number"
    );

    if (hasPath && hasLine && position?.baseSha && position?.headSha && position?.startSha) {
      const positionData: Record<string, string | number> = {
        base_sha: position.baseSha,
        head_sha: position.headSha,
        start_sha: position.startSha,
        position_type: "text",
      };

      if (position.oldPath) positionData.old_path = position.oldPath;
      if (position.newPath) positionData.new_path = position.newPath;
      if (typeof position.oldLine === "number") positionData.old_line = position.oldLine;
      if (typeof position.newLine === "number") positionData.new_line = position.newLine;

      await this.request(
        `/projects/${repoId}/merge_requests/${reviewIid}/discussions`,
        {
          method: "POST",
          body: JSON.stringify({ body, position: positionData }),
        }
      );
    } else {
      await this.request(
        `/projects/${repoId}/merge_requests/${reviewIid}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        }
      );
    }
  }

  async mergeReview(repoId: number, reviewIid: number, options?: MergeOptions): Promise<void> {
    const {
      strategy = "immediate",
      shouldRemoveSourceBranch = false,
      squash = false,
    } = options || {};

    await this.request(
      `/projects/${repoId}/merge_requests/${reviewIid}/merge`,
      {
        method: "PUT",
        body: JSON.stringify({
          merge_when_pipeline_succeeds: strategy === "pipeline",
          should_remove_source_branch: shouldRemoveSourceBranch,
          squash,
        }),
      }
    );
  }
}

/** 创建 GitLab 适配器实例 */
export function createGitLabAdapter(baseUrl: string, token: string): PlatformAdapter {
  return new GitLabAdapter(baseUrl, token);
}
