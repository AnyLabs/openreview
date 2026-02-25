import type { PlatformDiscussion, PlatformCommentNote } from "../../../types/platform";

export interface DiscussionThreadNote {
  id: number | string;
  body: string;
  authorName: string;
  authorAvatarUrl?: string;
  createdAt: string;
}

export interface DiscussionThreadView {
  id: string;
  resolved: boolean;
  notes: DiscussionThreadNote[];
}

export interface FileLineDiscussions {
  additions: Record<number, DiscussionThreadView[]>;
  deletions: Record<number, DiscussionThreadView[]>;
}

export interface FileDiscussions {
  fileThreads: DiscussionThreadView[];
  lineThreads: FileLineDiscussions;
  totalCount: number;
}

function buildThreadView(
  discussion: PlatformDiscussion
): DiscussionThreadView {
  const notes = discussion.notes
    .filter((note: PlatformCommentNote) => !note.system)
    .map((note: PlatformCommentNote) => ({
      id: note.id,
      body: note.body,
      authorName: note.authorName,
      authorAvatarUrl: note.authorAvatarUrl,
      createdAt: note.createdAt,
    }));

  return {
    id: discussion.id,
    resolved: discussion.resolved ?? false,
    notes,
  };
}

function appendLineThread(
  target: Record<number, DiscussionThreadView[]>,
  lineNumber: number,
  thread: DiscussionThreadView
): void {
  if (!target[lineNumber]) {
    target[lineNumber] = [];
  }
  target[lineNumber].push(thread);
}

export function buildFileDiscussions(
  discussions: PlatformDiscussion[],
  oldPath: string,
  newPath: string
): FileDiscussions {
  const fileThreads: DiscussionThreadView[] = [];
  const lineThreads: FileLineDiscussions = { additions: {}, deletions: {} };
  let totalCount = 0;

  for (const discussion of discussions) {
    const position = discussion.position;
    if (!position) continue;

    const thread = buildThreadView(discussion);
    if (thread.notes.length === 0) continue;

    const hasNewPath = Boolean(position.newPath && position.newPath === newPath);
    const hasOldPath = Boolean(position.oldPath && position.oldPath === oldPath);
    if (!hasNewPath && !hasOldPath) continue;

    const hasLine =
      typeof position.newLine === "number" || typeof position.oldLine === "number";
    totalCount += thread.notes.length;

    if (!hasLine) {
      fileThreads.push(thread);
      continue;
    }

    if (hasNewPath && typeof position.newLine === "number") {
      appendLineThread(lineThreads.additions, position.newLine, thread);
    }

    if (hasOldPath && typeof position.oldLine === "number") {
      appendLineThread(lineThreads.deletions, position.oldLine, thread);
    }
  }

  return {
    fileThreads,
    lineThreads,
    totalCount,
  };
}
