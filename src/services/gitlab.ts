/**
 * GitLab API 服务
 * 封装所有 GitLab API 调用
 */

import type {
  GitLabUser,
  GitLabGroup,
  GitLabProject,
  GitLabMergeRequest,
  GitLabMergeRequestWithChanges,
  GitLabMergeRequestDiscussion,
  GitLabMergeRequestMergeOptions,
  MRState,
} from "../types/gitlab";

/** GitLab API 客户端配置 */
interface GitLabClientConfig {
  baseUrl: string;
  token: string;
}

interface GitLabMergeRequestCommit {
  id: string;
  author_name: string;
  created_at: string;
  title: string;
  web_url?: string;
}

interface GitLabCommitDiffFile {
  old_path: string;
  new_path: string;
  diff?: string;
}

export interface GitLabCommitAuthorInfo {
  commitId: string;
  authorName: string;
  title: string;
  createdAt: string;
  webUrl?: string;
}

export interface GitLabFileLineLatestCommitters {
  additions: Record<number, GitLabCommitAuthorInfo>;
  deletions: Record<number, GitLabCommitAuthorInfo>;
}

interface GitLabMergeRequestAuthorData {
  fileAuthors: Record<string, string[]>;
  lineLatestCommitters: Record<string, GitLabFileLineLatestCommitters>;
}

/** 解析 diff 内容，提取新增/删除行号 */
function parseDiffChangedLines(diffContent: string): {
  additions: number[];
  deletions: number[];
} {
  const additions: number[] = [];
  const deletions: number[] = [];
  const lines = diffContent.split("\n");

  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1], 10);
      newLine = Number.parseInt(hunkMatch[2], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++ ")) {
      additions.push(newLine);
      newLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("--- ")) {
      deletions.push(oldLine);
      oldLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { additions, deletions };
}

/** GitLab API 客户端 */
class GitLabClient {
  private baseUrl: string;
  private token: string;

  constructor(config: GitLabClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
  }

  /** 发起 API 请求 */
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v4${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "PRIVATE-TOKEN": this.token,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitLab API Error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /** 获取当前用户信息 */
  async getCurrentUser(): Promise<GitLabUser> {
    return this.request<GitLabUser>("/user");
  }

  /** 获取群组列表（Developer 及以上权限） */
  async getGroups(): Promise<GitLabGroup[]> {
    return this.request<GitLabGroup[]>(
      "/groups?min_access_level=30&per_page=100"
    );
  }

  /** 获取子群组 */
  async getSubgroups(groupId: number | string): Promise<GitLabGroup[]> {
    return this.request<GitLabGroup[]>(
      `/groups/${groupId}/subgroups?min_access_level=30&per_page=100`
    );
  }

  /** 获取群组下的项目 */
  async getGroupProjects(groupId: number | string): Promise<GitLabProject[]> {
    return this.request<GitLabProject[]>(
      `/groups/${groupId}/projects?min_access_level=30&per_page=100&include_subgroups=true`
    );
  }

  /** 获取用户参与的所有项目 */
  async getProjects(): Promise<GitLabProject[]> {
    return this.request<GitLabProject[]>(
      "/projects?membership=true&min_access_level=30&per_page=100"
    );
  }

  /** 获取项目的 Merge Requests */
  async getMergeRequests(
    projectId: number,
    state: MRState = "opened"
  ): Promise<GitLabMergeRequest[]> {
    const stateParam = state === "all" ? "" : `&state=${state}`;
    return this.request<GitLabMergeRequest[]>(
      `/projects/${projectId}/merge_requests?per_page=50${stateParam}`
    );
  }

  /** 获取 MR 详情（包含变更文件） */
  async getMergeRequestWithChanges(
    projectId: number,
    mrIid: number
  ): Promise<GitLabMergeRequestWithChanges> {
    // 获取 MR 详情
    const mr = await this.request<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests/${mrIid}`
    );

    // 获取变更列表 - GitLab API 直接返回 diffs 数组
    const diffs = await this.request<GitLabMergeRequestWithChanges["changes"]>(
      `/projects/${projectId}/merge_requests/${mrIid}/diffs`
    );

    return {
      ...mr,
      changes: Array.isArray(diffs) ? diffs : [],
    };
  }

  /** 获取 MR 下的讨论列表 */
  async getMergeRequestDiscussions(
    projectId: number,
    mrIid: number
  ): Promise<GitLabMergeRequestDiscussion[]> {
    return this.request<GitLabMergeRequestDiscussion[]>(
      `/projects/${projectId}/merge_requests/${mrIid}/discussions?per_page=100`
    );
  }

  /** 获取 MR 的文件作者和每个变更行最新提交者 */
  async getMergeRequestAuthorData(
    projectId: number,
    mrIid: number
  ): Promise<GitLabMergeRequestAuthorData> {
    const rawCommits = await this.request<GitLabMergeRequestCommit[]>(
      `/projects/${projectId}/merge_requests/${mrIid}/commits?per_page=100`
    );
    const commits = [...rawCommits].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    );

    const fileAuthorMap = new Map<string, Set<string>>();
    const lineLatestCommitters: Record<string, GitLabFileLineLatestCommitters> =
      {};

    await Promise.all(
      commits.map(async (commit) => {
        const commitDiffs = await this.request<GitLabCommitDiffFile[]>(
          `/projects/${projectId}/repository/commits/${commit.id}/diff?per_page=100`
        );
        const authorName = commit.author_name?.trim();
        if (!authorName) return;

        const commitInfo: GitLabCommitAuthorInfo = {
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

          if (!lineLatestCommitters[filePath]) {
            lineLatestCommitters[filePath] = {
              additions: {},
              deletions: {},
            };
          }

          const changedLines = parseDiffChangedLines(changedFile.diff || "");
          const fileLineAuthors = lineLatestCommitters[filePath];

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
      lineLatestCommitters,
    };
  }

  /** 获取文件内容 */
  async getFileContent(
    projectId: number,
    filePath: string,
    ref: string
  ): Promise<string> {
    const encodedPath = encodeURIComponent(filePath);
    const response = await fetch(
      `${this.baseUrl}/api/v4/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${ref}`,
      {
        headers: {
          "PRIVATE-TOKEN": this.token,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    return response.text();
  }

  /** 发表评论 */
  async postComment(
    projectId: number,
    mrIid: number,
    body: string,
    options?: {
      path?: string;
      line?: number;
      oldPath?: string;
      newPath?: string;
      oldLine?: number;
      newLine?: number;
      baseSha?: string;
      headSha?: string;
      startSha?: string;
    }
  ): Promise<void> {
    const {
      path,
      line,
      oldPath,
      newPath,
      oldLine,
      newLine,
      baseSha,
      headSha,
      startSha,
    } = options || {};

    const hasPath = Boolean(path || oldPath || newPath);
    const hasLine = [line, oldLine, newLine].some(
      (value) => typeof value === "number"
    );

    if (hasPath && hasLine && baseSha && headSha && startSha) {
      const position: Record<string, string | number> = {
        base_sha: baseSha,
        head_sha: headSha,
        start_sha: startSha,
        position_type: "text",
      };

      if (oldPath || path) {
        position.old_path = oldPath || path || "";
      }

      if (newPath || path) {
        position.new_path = newPath || path || "";
      }

      if (typeof oldLine === "number") {
        position.old_line = oldLine;
      }

      if (typeof newLine === "number") {
        position.new_line = newLine;
      } else if (typeof line === "number") {
        position.new_line = line;
      }

      // 创建行级评论（讨论）
      await this.request(
        `/projects/${projectId}/merge_requests/${mrIid}/discussions`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            position,
          }),
        }
      );
    } else {
      // 创建普通评论
      await this.request(
        `/projects/${projectId}/merge_requests/${mrIid}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        }
      );
    }
  }

  /** 合并 MR */
  async mergeMergeRequest(
    projectId: number,
    mrIid: number,
    options?: GitLabMergeRequestMergeOptions
  ): Promise<GitLabMergeRequest> {
    const {
      mergeWhenPipelineSucceeds = false,
      shouldRemoveSourceBranch = false,
      squash = false,
    } = options || {};

    return this.request<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests/${mrIid}/merge`,
      {
        method: "PUT",
        body: JSON.stringify({
          merge_when_pipeline_succeeds: mergeWhenPipelineSucceeds,
          should_remove_source_branch: shouldRemoveSourceBranch,
          squash,
        }),
      }
    );
  }
}

// 单例客户端实例
let clientInstance: GitLabClient | null = null;

/** 初始化 GitLab 客户端 */
export function initGitLabClient(baseUrl: string, token: string): void {
  clientInstance = new GitLabClient({ baseUrl, token });
}

/** 获取 GitLab 客户端 */
export function getGitLabClient(): GitLabClient {
  if (!clientInstance) {
    throw new Error(
      "GitLab client not initialized. Please set your GitLab URL and Token."
    );
  }
  return clientInstance;
}

/** 检查客户端是否已初始化 */
export function isGitLabClientInitialized(): boolean {
  return clientInstance !== null;
}

/** 销毁客户端实例 */
export function destroyGitLabClient(): void {
  clientInstance = null;
}

// 导出类型供外部使用
export type { GitLabClient };
