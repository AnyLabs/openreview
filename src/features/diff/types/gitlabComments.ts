import type { GitLabMergeRequestDiscussion } from "../../../types/gitlab";

export interface GitLabDiscussionRenderNote {
  id: number;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface GitLabDiscussionThreadView {
  id: string;
  resolved: boolean;
  notes: GitLabDiscussionRenderNote[];
}

export interface GitLabFileLineDiscussions {
  additions: Record<number, GitLabDiscussionThreadView[]>;
  deletions: Record<number, GitLabDiscussionThreadView[]>;
}

export interface GitLabFileDiscussions {
  fileThreads: GitLabDiscussionThreadView[];
  lineThreads: GitLabFileLineDiscussions;
  totalCount: number;
}

function buildThreadView(
  discussion: GitLabMergeRequestDiscussion
): GitLabDiscussionThreadView {
  const notes = discussion.notes
    .filter((note) => !note.system)
    .map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.author?.name || note.author?.username || "未知用户",
      createdAt: note.created_at,
    }));

  return {
    id: discussion.id,
    resolved: discussion.notes.some((note) => note.resolved === true),
    notes,
  };
}

function appendLineThread(
  target: Record<number, GitLabDiscussionThreadView[]>,
  lineNumber: number,
  thread: GitLabDiscussionThreadView
): void {
  if (!target[lineNumber]) {
    target[lineNumber] = [];
  }
  target[lineNumber].push(thread);
}

export function buildFileDiscussions(
  discussions: GitLabMergeRequestDiscussion[],
  oldPath: string,
  newPath: string
): GitLabFileDiscussions {
  const fileThreads: GitLabDiscussionThreadView[] = [];
  const lineThreads: GitLabFileLineDiscussions = { additions: {}, deletions: {} };
  let totalCount = 0;

  for (const discussion of discussions) {
    const position =
      discussion.notes.find((note) => note.position)?.position || null;
    if (!position) continue;

    const thread = buildThreadView(discussion);
    if (thread.notes.length === 0) continue;

    const hasNewPath = Boolean(position.new_path && position.new_path === newPath);
    const hasOldPath = Boolean(position.old_path && position.old_path === oldPath);
    if (!hasNewPath && !hasOldPath) continue;

    const hasLine =
      typeof position.new_line === "number" || typeof position.old_line === "number";
    totalCount += thread.notes.length;

    if (!hasLine) {
      fileThreads.push(thread);
      continue;
    }

    if (hasNewPath && typeof position.new_line === "number") {
      appendLineThread(lineThreads.additions, position.new_line, thread);
    }

    if (hasOldPath && typeof position.old_line === "number") {
      appendLineThread(lineThreads.deletions, position.old_line, thread);
    }
  }

  return {
    fileThreads,
    lineThreads,
    totalCount,
  };
}
