/**
 * Diff 视图组件
 * 使用 FileDiff 组件展示多个文件的代码差异
 */

import { useState, useCallback, useEffect } from "react";
import { FileDiff } from "./FileDiff";
import { useFileAIReviewContext } from "../../../hooks/useFileAIReviewContext";
import { requirePlatformAdapter } from "../../../contexts/PlatformContext";
import type {
  PlatformDiff,
  PlatformReview,
} from "../../../types/platform";
import type { FileLineCommitters } from "../../../types/platform";
import type { PlatformDiscussion } from "../../../types/platform";
import { buildFileDiscussions } from "../types/reviewComments";

interface DiffViewerProps {
  /** diff 文件列表 */
  diffs: PlatformDiff[];
  /** 当前选中的文件索引 */
  selectedFileIndex?: number | null;
  /** 文件选中回调 */
  onFileSelect?: (index: number, diff: PlatformDiff) => void;
  /** 仓库 ID */
  repoId?: number;
  /** Review IID */
  reviewIid?: number;
  /** Review diff refs */
  diffRefs?: PlatformReview["diffRefs"];
}

interface DiffChangedLines {
  newLines: Set<number>;
  oldLines: Set<number>;
  firstNewLine: number | null;
  firstOldLine: number | null;
}

function parseChangedLines(diffText: string): DiffChangedLines {
  const newLines = new Set<number>();
  const oldLines = new Set<number>();
  const lines = diffText.split("\n");

  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  let firstNewLine: number | null = null;
  let firstOldLine: number | null = null;

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
      newLines.add(newLine);
      if (firstNewLine === null) firstNewLine = newLine;
      newLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("--- ")) {
      oldLines.add(oldLine);
      if (firstOldLine === null) firstOldLine = oldLine;
      oldLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { newLines, oldLines, firstNewLine, firstOldLine };
}

function extractMentionedLine(content: string): number | null {
  const matchers = [/(?:^|[^\d])行\s*(\d+)(?!\d)/m, /(?:^|[^\d])line\s*(\d+)(?!\d)/im];

  for (const matcher of matchers) {
    const match = content.match(matcher);
    if (match) {
      const line = Number.parseInt(match[1], 10);
      if (Number.isFinite(line) && line > 0) return line;
    }
  }

  return null;
}

function resolveDiffPosition(
  diff: PlatformDiff,
  content: string
): { oldLine?: number; newLine?: number } | null {
  const { newLines, oldLines, firstNewLine, firstOldLine } = parseChangedLines(
    diff.diff || ""
  );
  const mentionedLine = extractMentionedLine(content);

  if (mentionedLine !== null) {
    if (newLines.has(mentionedLine)) {
      return { newLine: mentionedLine };
    }
    if (oldLines.has(mentionedLine)) {
      return { oldLine: mentionedLine };
    }
  }

  if (firstNewLine !== null) {
    return { newLine: firstNewLine };
  }
  if (firstOldLine !== null) {
    return { oldLine: firstOldLine };
  }

  return null;
}

/**
 * Diff 视图组件
 */
export function DiffViewer({
  diffs,
  selectedFileIndex,
  onFileSelect,
  repoId,
  reviewIid,
  diffRefs,
}: DiffViewerProps) {
  // 使用文件级 AI Review Context 共享状态
  const { getFileState } = useFileAIReviewContext();
  const [fileAuthorsMap, setFileAuthorsMap] = useState<Record<string, string[]>>(
    {}
  );
  const [lineLatestCommittersMap, setLineLatestCommittersMap] = useState<
    Record<string, FileLineCommitters>
  >({});
  const [discussions, setDiscussions] = useState<PlatformDiscussion[]>([]);

  // 记录所有已展开文件索引，默认全部收起
  const [expandedFileIndexes, setExpandedFileIndexes] = useState<Set<number>>(
    () => new Set()
  );

  // 切换单个文件展开状态，并在点击标题栏时选中文件
  const handleFileToggle = useCallback(
    (fileIndex: number, diff: PlatformDiff) => {
      return (expanded: boolean) => {
        setExpandedFileIndexes((prev) => {
          const next = new Set(prev);
          if (expanded) {
            next.add(fileIndex);
          } else {
            next.delete(fileIndex);
          }
          return next;
        });
        onFileSelect?.(fileIndex, diff);
      };
    },
    [onFileSelect]
  );

  // 展开所有文件
  const expandAll = useCallback(() => {
    setExpandedFileIndexes(new Set(diffs.map((_, index) => index)));
  }, [diffs]);

  // 收起所有文件
  const collapseAll = useCallback(() => {
    setExpandedFileIndexes(new Set());
  }, []);

  // 处理提交评论
  const handleSubmitComment = useCallback(
    async (diff: PlatformDiff, content: string) => {
      if (!repoId || !reviewIid) return;

      try {
        const adapter = requirePlatformAdapter();
        const position = resolveDiffPosition(diff, content);
        const oldPath = diff.oldPath || diff.newPath || undefined;
        const newPath = diff.newPath || diff.oldPath || undefined;

        if (diffRefs && position) {
          await adapter.postComment({
            repoId,
            reviewIid,
            body: content,
            position: {
              oldPath,
              newPath,
              oldLine: position.oldLine,
              newLine: position.newLine,
              baseSha: diffRefs?.baseSha,
              headSha: diffRefs?.headSha,
              startSha: diffRefs?.startSha,
            },
          });
          return;
        }

        await adapter.postComment({
          repoId,
          reviewIid,
          body: content,
        });
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "提交评论失败");
      }
    },
    [repoId, reviewIid, diffRefs]
  );

  useEffect(() => {
    let disposed = false;

    const fetchFileAuthors = async () => {
      if (!repoId || !reviewIid) {
        setFileAuthorsMap({});
        setLineLatestCommittersMap({});
        return;
      }

      try {
        const adapter = requirePlatformAdapter();
        const [authorData, discussionsData] = await Promise.all([
          adapter.getReviewAuthorData(repoId, reviewIid),
          adapter.getReviewDiscussions(repoId, reviewIid),
        ]);
        if (!disposed) {
          setFileAuthorsMap(authorData.fileAuthors);
          setLineLatestCommittersMap(authorData.lineCommitters);
          setDiscussions(Array.isArray(discussionsData) ? discussionsData : []);
        }
      } catch {
        if (!disposed) {
          setFileAuthorsMap({});
          setLineLatestCommittersMap({});
          setDiscussions([]);
        }
      }
    };

    fetchFileAuthors();

    return () => {
      disposed = true;
    };
  }, [repoId, reviewIid]);

  if (diffs.length === 0) {
    return (
      <div className="diff-empty">
        <p>没有变更内容</p>
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      {/* 文件列表头部 */}
      <div className="diff-files-header">
        <div className="diff-files-title">
          <span className="diff-files-count">{diffs.length} 个文件</span>
        </div>
        <div className="diff-files-actions">
          <button
            className="diff-action-btn"
            onClick={expandAll}
          >
            展开全部
          </button>
          <button
            className="diff-action-btn"
            onClick={collapseAll}
          >
            收起全部
          </button>
        </div>
      </div>

      {/* 文件差异列表 */}
      <div className="diff-files-list">
        {diffs.map((diff, index) => {
          const fileKey = diff.newPath || diff.oldPath || `file-${index}`;
          const isSelected = selectedFileIndex === index;
          const filePath = diff.newPath || diff.oldPath || "";
          const oldPath = diff.oldPath || filePath;
          const newPath = diff.newPath || filePath;
          const fileDiscussions = buildFileDiscussions(discussions, oldPath, newPath);

          // 获取该文件的 AI Review 状态
          const fileReviewState = getFileState(filePath);

          // 多展开模式：按索引集合判断当前文件是否展开
          const isExpanded = expandedFileIndexes.has(index);

          return (
            <div
              key={fileKey}
              className={`diff-file-wrapper ${isSelected ? "selected" : ""}`}
            >
              <FileDiff
                diff={diff}
                commitAuthors={fileAuthorsMap[filePath] || []}
                lineLatestCommitters={lineLatestCommittersMap[filePath]}
                discussions={fileDiscussions}
                defaultExpanded={isExpanded}
                onToggle={handleFileToggle(index, diff)}
                isSelected={isSelected}
                aiReviewResult={fileReviewState.result}
                aiReviewLoading={fileReviewState.loading}
                aiReviewError={fileReviewState.error}
                repoId={repoId}
                reviewIid={reviewIid}
                onSubmitComment={(content) => handleSubmitComment(diff, content)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
