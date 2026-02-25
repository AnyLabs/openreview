/**
 * GitHub 平台适配器
 * 实现 PlatformAdapter 接口，封装 GitHub REST API 调用
 *
 * GitHub API 文档: https://docs.github.com/en/rest
 * - 认证: Authorization: Bearer <token>
 * - 分页: Link header (rel="next")
 * - Repo 路由: /repos/{owner}/{repo} 或 /repositories/{id}
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
import { parseDiffChangedLines } from "./diff-utils";
import { request as httpRequest } from "../net/http-client";

// ============ GitHub API 原始类型 ============

interface GitHubUserRaw {
  id: number;
  login: string;
  name?: string;
  avatar_url: string;
  html_url: string;
}

interface GitHubOrgRaw {
  id: number;
  login: string;
  description?: string;
  avatar_url: string;
  html_url: string;  // 组织的 Web UI URL
}

interface GitHubRepoRaw {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  html_url: string;
  default_branch: string;
  owner: GitHubUserRaw;
}

interface GitHubPullRaw {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed";
  merged: boolean;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  user: GitHubUserRaw;
  html_url: string;
  created_at: string;
  updated_at: string;
  merge_commit_sha?: string;
}

interface GitHubPullFileRaw {
  filename: string;
  previous_filename?: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  patch?: string;
}

interface GitHubReviewCommentRaw {
  id: number;
  body: string;
  user: GitHubUserRaw;
  created_at: string;
  path: string;
  line?: number;
  original_line?: number;
  side?: "LEFT" | "RIGHT";
  in_reply_to_id?: number;
  pull_request_review_id?: number;
}

interface GitHubIssueCommentRaw {
  id: number;
  body: string;
  user: GitHubUserRaw;
  created_at: string;
}

interface GitHubCommitRaw {
  sha: string;
  commit: {
    author: { name: string; date: string };
    message: string;
  };
  html_url: string;
  files?: Array<{
    filename: string;
    previous_filename?: string;
    status: string;
    patch?: string;
  }>;
}

// ============ ID → fullName 映射缓存 ============

/** 将 repo 数字 ID 映射到 owner/repo 字符串（GitHub API 路由需要） */
const repoIdToFullName = new Map<number, string>();

// ============ 类型转换函数 ============

function toUser(raw: GitHubUserRaw): PlatformUser {
  return {
    id: raw.id,
    username: raw.login,
    name: raw.name || raw.login,
    avatarUrl: raw.avatar_url,
    webUrl: raw.html_url,
  };
}

function toOrg(raw: GitHubOrgRaw): PlatformOrg {
  return {
    id: raw.id,
    name: raw.login,
    path: raw.login,
    fullName: raw.login,
    fullPath: raw.login,
    description: raw.description || undefined,
    avatarUrl: raw.avatar_url,
    webUrl: raw.html_url,  // 使用 API 返回的 html_url（支持 GHE）
  };
}

function toRepo(raw: GitHubRepoRaw): PlatformRepo {
  // 缓存 ID → fullName 映射
  repoIdToFullName.set(raw.id, raw.full_name);

  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    defaultBranch: raw.default_branch,
    description: raw.description || undefined,
    webUrl: raw.html_url,
    namespace: raw.owner
      ? { id: raw.owner.id, name: raw.owner.login, path: raw.owner.login }
      : undefined,
  };
}

function toReviewState(raw: GitHubPullRaw): ReviewState {
  if (raw.merged) return "merged";
  if (raw.state === "closed") return "closed";
  return "open";
}

function toReview(raw: GitHubPullRaw): PlatformReview {
  return {
    id: raw.id,
    iid: raw.number,
    title: raw.title,
    description: raw.body || undefined,
    state: toReviewState(raw),
    sourceBranch: raw.head.ref,
    targetBranch: raw.base.ref,
    author: toUser(raw.user),
    webUrl: raw.html_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    diffRefs: {
      baseSha: raw.base.sha,
      headSha: raw.head.sha,
      startSha: raw.base.sha,
    },
    _raw: raw,
  };
}

function toDiff(raw: GitHubPullFileRaw): PlatformDiff {
  const isRenamed = raw.status === "renamed" || raw.status === "copied";
  return {
    oldPath: raw.previous_filename || raw.filename,
    newPath: raw.filename,
    diff: raw.patch || "",
    newFile: raw.status === "added",
    renamedFile: isRenamed,
    deletedFile: raw.status === "removed",
  };
}

// ============ 分页辅助 ============

/** 从 Link header 中解析下一页 URL */
function parseNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

// ============ 适配器实现 ============

class GitHubAdapter implements PlatformAdapter {
  readonly type = "github" as const;
  private apiBase: string;
  private token: string;
  /** 最大分页数，防止无限循环 */
  private maxPages = 10;

  constructor(url: string, token: string) {
    const cleanUrl = url.replace(/\/$/, "");
    // 判断是 github.com 还是 GitHub Enterprise
    if (cleanUrl === "https://github.com" || cleanUrl === "http://github.com") {
      this.apiBase = "https://api.github.com";
    } else {
      // GitHub Enterprise: https://<host>/api/v3
      this.apiBase = `${cleanUrl}/api/v3`;
    }
    this.token = token;
  }

  /** 发起 API 请求（使用统一 HTTP 客户端） */
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.apiBase}${endpoint}`;

    // 合并 headers
    const mergedHeaders: Record<string, string> = {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
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
      platform: "github",
      retry: {
        maxRetries: 2,
        baseDelayMs: 1000,
      },
    });
  }

  /** 发起请求并返回原始文本（用于特殊场景如 raw 文件内容） */
  private async requestText(
    endpoint: string,
    options?: RequestInit
  ): Promise<string> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.apiBase}${endpoint}`;

    // 合并 headers
    const mergedHeaders: Record<string, string> = {
      "Accept": "application/vnd.github.raw+json",
      "Authorization": `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (options?.headers) {
      const headers = options.headers as Record<string, string>;
      Object.assign(mergedHeaders, headers);
    }

    return httpRequest<string>({
      url,
      method: options?.method as "GET" | "POST" || "GET",
      headers: mergedHeaders,
      platform: "github",
      retry: false,
    });
  }

  /** 发起请求并返回完整响应（用于分页） */
  private async rawRequest(
    endpoint: string,
    options?: RequestInit
  ): Promise<Response> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.apiBase}${endpoint}`;

    // 合并 headers
    const mergedHeaders: Record<string, string> = {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (options?.headers) {
      const headers = options.headers as Record<string, string>;
      Object.assign(mergedHeaders, headers);
    }

    const response = await fetch(url, {
      ...options,
      headers: mergedHeaders,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API Error: ${response.status} - ${error}`);
    }

    return response;
  }

  /** 自动分页获取所有结果 */
  private async fetchAllPages<T>(endpoint: string): Promise<T[]> {
    const sep = endpoint.includes("?") ? "&" : "?";
    let url = `${this.apiBase}${endpoint}${sep}per_page=100`;
    let results: T[] = [];
    let pages = 0;

    while (url && pages < this.maxPages) {
      const response = await this.rawRequest(url);
      const data = (await response.json()) as T[];
      results = results.concat(data);
      url = parseNextPageUrl(response.headers.get("Link")) || "";
      pages += 1;
    }

    return results;
  }

  /** 获取 repo 的 owner/repo 字符串 */
  private async getRepoFullName(repoId: number): Promise<string> {
    const cached = repoIdToFullName.get(repoId);
    if (cached) return cached;

    // 通过 repo ID 获取 repo 信息
    const raw = await this.request<GitHubRepoRaw>(`/repositories/${repoId}`);
    repoIdToFullName.set(raw.id, raw.full_name);
    return raw.full_name;
  }

  async getCurrentUser(): Promise<PlatformUser> {
    const raw = await this.request<GitHubUserRaw>("/user");
    return toUser(raw);
  }

  async getOrgs(): Promise<PlatformOrg[]> {
    const raw = await this.fetchAllPages<GitHubOrgRaw>("/user/orgs");
    return raw.map(toOrg);
  }

  async getSubOrgs(): Promise<PlatformOrg[]> {
    // GitHub 组织没有子组织概念
    return [];
  }

  async getOrgRepos(orgId: number | string): Promise<PlatformRepo[]> {
    // orgId 对于 GitHub 来说需要是 org login 名
    // 如果传入数字 ID，尝试从缓存中查找
    let orgLogin: string;
    if (typeof orgId === "string") {
      orgLogin = orgId;
    } else {
      // 尝试通过 API 获取 org 信息
      const org = await this.request<GitHubOrgRaw>(`/organizations/${orgId}`);
      orgLogin = org.login;
    }

    const raw = await this.fetchAllPages<GitHubRepoRaw>(`/orgs/${orgLogin}/repos`);
    return raw.map(toRepo);
  }

  async getRepos(): Promise<PlatformRepo[]> {
    const raw = await this.fetchAllPages<GitHubRepoRaw>(
      "/user/repos?affiliation=owner,collaborator,organization_member&sort=updated"
    );
    return raw.map(toRepo);
  }

  async getReviews(repoId: number, state?: ReviewState): Promise<PlatformReview[]> {
    const fullName = await this.getRepoFullName(repoId);
    // GitHub PR state: open | closed | all
    let ghState = "open";
    if (state === "closed" || state === "merged") ghState = "closed";
    else if (state === "all") ghState = "all";

    const raw = await this.fetchAllPages<GitHubPullRaw>(
      `/repos/${fullName}/pulls?state=${ghState}&sort=updated&direction=desc`
    );

    let reviews = raw.map(toReview);

    // 如果请求的是 merged 状态，需要从 closed 中过滤
    if (state === "merged") {
      reviews = reviews.filter((r) => r.state === "merged");
    }

    return reviews;
  }

  async getReviewWithChanges(repoId: number, reviewIid: number): Promise<PlatformReviewWithChanges> {
    const fullName = await this.getRepoFullName(repoId);

    const [prRaw, filesRaw] = await Promise.all([
      this.request<GitHubPullRaw>(`/repos/${fullName}/pulls/${reviewIid}`),
      this.fetchAllPages<GitHubPullFileRaw>(`/repos/${fullName}/pulls/${reviewIid}/files`),
    ]);

    return {
      ...toReview(prRaw),
      changes: filesRaw.map(toDiff),
    };
  }

  async getReviewDiscussions(repoId: number, reviewIid: number): Promise<PlatformDiscussion[]> {
    const fullName = await this.getRepoFullName(repoId);

    const [reviewComments, issueComments] = await Promise.all([
      this.fetchAllPages<GitHubReviewCommentRaw>(
        `/repos/${fullName}/pulls/${reviewIid}/comments`
      ),
      this.fetchAllPages<GitHubIssueCommentRaw>(
        `/repos/${fullName}/issues/${reviewIid}/comments`
      ),
    ]);

    const discussions: PlatformDiscussion[] = [];

    // 将 review comments 按 in_reply_to_id 分组为线程
    const threadMap = new Map<number, GitHubReviewCommentRaw[]>();
    const rootComments: GitHubReviewCommentRaw[] = [];

    for (const comment of reviewComments) {
      if (comment.in_reply_to_id) {
        const existing = threadMap.get(comment.in_reply_to_id) || [];
        existing.push(comment);
        threadMap.set(comment.in_reply_to_id, existing);
      } else {
        rootComments.push(comment);
      }
    }

    for (const root of rootComments) {
      const replies = threadMap.get(root.id) || [];
      const allNotes = [root, ...replies];

      discussions.push({
        id: `review-${root.id}`,
        notes: allNotes.map((note) => ({
          id: note.id,
          body: note.body,
          authorName: note.user?.name || note.user?.login || "未知用户",
          authorAvatarUrl: note.user?.avatar_url,
          createdAt: note.created_at,
          system: false,
        })),
        position: {
          oldPath: root.path,
          newPath: root.path,
          newLine: root.line ?? null,
          oldLine: root.side === "LEFT" ? root.original_line ?? null : null,
        },
      });
    }

    // 将 issue comments 转为独立讨论（无行级定位）
    for (const comment of issueComments) {
      discussions.push({
        id: `issue-${comment.id}`,
        notes: [
          {
            id: comment.id,
            body: comment.body,
            authorName: comment.user?.name || comment.user?.login || "未知用户",
            authorAvatarUrl: comment.user?.avatar_url,
            createdAt: comment.created_at,
            system: false,
          },
        ],
      });
    }

    return discussions;
  }

  async getReviewAuthorData(repoId: number, reviewIid: number): Promise<{
    fileAuthors: Record<string, string[]>;
    lineCommitters: Record<string, FileLineCommitters>;
  }> {
    const fullName = await this.getRepoFullName(repoId);

    const commitsRaw = await this.fetchAllPages<GitHubCommitRaw>(
      `/repos/${fullName}/pulls/${reviewIid}/commits`
    );

    const fileAuthorMap = new Map<string, Set<string>>();
    const lineCommitters: Record<string, FileLineCommitters> = {};

    // 按时间排序，确保后提交覆盖先提交
    const sortedCommits = [...commitsRaw].sort(
      (a, b) => Date.parse(a.commit.author.date) - Date.parse(b.commit.author.date)
    );

    await Promise.all(
      sortedCommits.map(async (commit) => {
        const authorName = commit.commit.author.name?.trim();
        if (!authorName) return;

        // 获取每个 commit 的文件变更
        let files = commit.files;
        if (!files) {
          const detail = await this.request<GitHubCommitRaw>(
            `/repos/${fullName}/commits/${commit.sha}`
          );
          files = detail.files;
        }
        if (!files) return;

        const commitInfo: CommitAuthorInfo = {
          commitId: commit.sha,
          authorName,
          title: commit.commit.message.split("\n")[0] || "无标题提交",
          createdAt: commit.commit.author.date,
          webUrl: commit.html_url,
        };

        for (const file of files) {
          const filePath = file.filename;
          if (!filePath) continue;

          if (!fileAuthorMap.has(filePath)) {
            fileAuthorMap.set(filePath, new Set<string>());
          }
          fileAuthorMap.get(filePath)?.add(authorName);

          if (!lineCommitters[filePath]) {
            lineCommitters[filePath] = { additions: {}, deletions: {} };
          }

          const changedLines = parseDiffChangedLines(file.patch || "");
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
    const fullName = await this.getRepoFullName(repoId);
    const encodedPath = encodeURIComponent(filePath);

    return this.requestText(
      `/repos/${fullName}/contents/${encodedPath}?ref=${ref}`
    );
  }

  async postComment(params: PostCommentParams): Promise<void> {
    const { repoId, reviewIid, body, position } = params;
    const fullName = await this.getRepoFullName(repoId);

    const hasPath = Boolean(position?.oldPath || position?.newPath);
    const hasLine = typeof position?.newLine === "number" || typeof position?.oldLine === "number";

    if (hasPath && hasLine && position?.headSha) {
      // 行级评论（pull request review comment）
      const commentData: Record<string, unknown> = {
        body,
        commit_id: position.headSha,
        path: position.newPath || position.oldPath || "",
      };

      if (typeof position.newLine === "number") {
        commentData.line = position.newLine;
        commentData.side = "RIGHT";
      } else if (typeof position.oldLine === "number") {
        commentData.line = position.oldLine;
        commentData.side = "LEFT";
      }

      await this.request(
        `/repos/${fullName}/pulls/${reviewIid}/comments`,
        {
          method: "POST",
          body: JSON.stringify(commentData),
        }
      );
    } else {
      // 普通评论（issue comment）
      await this.request(
        `/repos/${fullName}/issues/${reviewIid}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        }
      );
    }
  }

  async mergeReview(repoId: number, reviewIid: number, options?: MergeOptions): Promise<void> {
    const fullName = await this.getRepoFullName(repoId);

    // GitHub merge_method: merge, squash, rebase
    // strategy="squash" 优先于独立的 squash 选项
    const mergeMethod = options?.strategy === "squash"
      ? "squash"
      : options?.strategy === "rebase"
        ? "rebase"
        : options?.strategy === "merge"
          ? "merge"
          : options?.squash
            ? "squash"
            : "merge"; // 默认使用 merge

    await this.request(
      `/repos/${fullName}/pulls/${reviewIid}/merge`,
      {
        method: "PUT",
        body: JSON.stringify({
          merge_method: mergeMethod,
        }),
      }
    );
  }
}

/** 创建 GitHub 适配器实例 */
export function createGitHubAdapter(url: string, token: string): PlatformAdapter {
  return new GitHubAdapter(url, token);
}
