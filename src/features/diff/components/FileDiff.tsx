/**
 * FileDiff 单个文件差异组件
 * 使用 TogglePanel 作为容器，展示单个文件的代码差异
 */

import {
  FilePlus,
  FileMinus,
  FileEdit,
  ArrowRightLeft,
  MessageCircle,
} from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation } from "@pierre/diffs/react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { TogglePanel } from "../../../components/ui/TogglePanel";
import { FileAIReviewResult } from "../../ai/components/FileAIReviewResult";
import type { PlatformDiff } from "../../../types/platform";
import type { AIReviewResult } from "../../../services/ai";
import type {
  CommitAuthorInfo,
  FileLineCommitters,
} from "../../../types/platform";
import type {
  DiscussionThreadView,
  FileDiscussions,
} from "../types/reviewComments";
import { useTheme } from "../../../contexts/ThemeContext";

interface FileDiffProps {
  /** 文件差异数据 */
  diff: PlatformDiff;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
  /** 展开状态变化回调 */
  onToggle?: (expanded: boolean) => void;
  /** 是否被选中 */
  isSelected?: boolean;
  /** AI 审查结果 */
  aiReviewResult?: AIReviewResult | null;
  /** AI 审查加载状态 */
  aiReviewLoading?: boolean;
  /** AI 审查错误 */
  aiReviewError?: string | null;
  /** 仓库 ID */
  repoId?: number;
  /** Review IID */
  reviewIid?: number;
  /** 提交评论回调 */
  onSubmitComment?: (content: string) => Promise<void>;
  /** 当前文件对应的提交作者 */
  commitAuthors?: string[];
  /** 当前文件每个变更行对应的最新提交者 */
  lineLatestCommitters?: FileLineCommitters;
  /** 当前文件对应的讨论数据 */
  discussions?: FileDiscussions;
}

interface LineAnnotationMeta {
  thread: DiscussionThreadView;
  side: "additions" | "deletions";
  lineNumber: number;
  threadKey: string;
}

interface LineCommentMarker {
  key: string;
  side: "additions" | "deletions";
  lineNumber: number;
  count: number;
  top: number;
  left: number;
}

interface HoveredLineCommitterCard {
  top: number;
  left: number;
  width: number;
  arrowLeft: number;
  placement: "top" | "bottom";
  anchorTop: number;
  anchorBottom: number;
  side: "additions" | "deletions";
  lineNumber: number;
  authorInfo: CommitAuthorInfo;
}

function getLineMarkerKey(side: "additions" | "deletions", lineNumber: number) {
  return `${side}-${lineNumber}`;
}

function areLineMarkersEqual(
  prev: LineCommentMarker[],
  next: LineCommentMarker[]
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const prevItem = prev[i];
    const nextItem = next[i];
    if (
      prevItem.key !== nextItem.key ||
      prevItem.count !== nextItem.count ||
      Math.abs(prevItem.top - nextItem.top) > 0.5 ||
      Math.abs(prevItem.left - nextItem.left) > 0.5
    ) {
      return false;
    }
  }
  return true;
}

/**
 * 获取文件状态图标
 */
function getFileStatusIcon(diff: PlatformDiff) {
  if (diff.newFile)
    return (
      <FilePlus
        size={14}
        className="file-status-icon added"
      />
    );
  if (diff.deletedFile)
    return (
      <FileMinus
        size={14}
        className="file-status-icon deleted"
      />
    );
  if (diff.renamedFile)
    return (
      <ArrowRightLeft
        size={14}
        className="file-status-icon renamed"
      />
    );
  return (
    <FileEdit
      size={14}
      className="file-status-icon modified"
    />
  );
}

/**
 * 获取文件状态徽章
 */
function getFileStatusBadge(diff: PlatformDiff) {
  if (diff.newFile) return <span className="badge badge-added">新增</span>;
  if (diff.deletedFile)
    return <span className="badge badge-deleted">删除</span>;
  if (diff.renamedFile)
    return <span className="badge badge-renamed">重命名</span>;
  return <span className="badge badge-modified">修改</span>;
}

/**
 * 解析diff内容，统计添加和删除的行数
 */
function parseDiffStats(diffContent: string): {
  added: number;
  deleted: number;
} {
  const lines = diffContent.split("\n");
  let added = 0;
  let deleted = 0;

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deleted++;
    }
  }

  return { added, deleted };
}

/**
 * 构建 unified diff patch 格式
 */
function buildUnifiedPatch(diff: PlatformDiff): string {
  const oldPath = diff.oldPath || "/dev/null";
  const newPath = diff.newPath || "/dev/null";

  // diff 内容已经是 unified diff 格式，添加文件头
  const header = `--- a/${oldPath}\n+++ b/${newPath}\n`;

  // 直接使用 diff 内容
  return header + (diff.diff || "");
}

function getDiscussionThreadKey(
  side: "additions" | "deletions",
  lineNumber: number,
  threadId: string
): string {
  return `${side}-${lineNumber}-${threadId}`;
}

/**
 * 文件差异头部组件
 */
function FileDiffHeader({
  diff,
  commitAuthors = [],
}: {
  diff: PlatformDiff;
  commitAuthors?: string[];
}) {
  const filePath = diff.renamedFile
    ? `${diff.oldPath} → ${diff.newPath}`
    : diff.newPath || diff.oldPath;

  return (
    <div className="file-diff-header-info">
      {getFileStatusIcon(diff)}
      <span
        className="file-diff-path"
        title={filePath}
      >
        {filePath}
      </span>
      {commitAuthors.length > 0 && (
        <span
          className="file-diff-authors"
          title={`提交作者: ${commitAuthors.join(", ")}`}
        >
          提交作者: {commitAuthors.join(", ")}
        </span>
      )}
    </div>
  );
}

/**
 * 文件差异头部操作区（变更统计）
 */
function FileDiffActions({ diff }: { diff: PlatformDiff }) {
  const stats = parseDiffStats(diff.diff || "");

  return (
    <div className="file-diff-actions">
      {getFileStatusBadge(diff)}
      {(stats.added > 0 || stats.deleted > 0) && (
        <div className="file-diff-stats">
          {stats.added > 0 && (
            <span className="diff-stat-added">+{stats.added}</span>
          )}
          {stats.deleted > 0 && (
            <span className="diff-stat-deleted">-{stats.deleted}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 单个文件的 Diff 视图
 */
export function FileDiff({
  diff,
  defaultExpanded = true,
  onToggle,
  isSelected = false,
  aiReviewResult,
  aiReviewLoading = false,
  aiReviewError = null,
  repoId,
  reviewIid,
  onSubmitComment,
  commitAuthors = [],
  lineLatestCommitters,
  discussions,
}: FileDiffProps) {
  const { resolvedTheme } = useTheme();
  const patch = buildUnifiedPatch(diff);
  const filePath = diff.newPath || diff.oldPath || "";
  const [expandedThreadKeys, setExpandedThreadKeys] = useState<Set<string>>(
    () => new Set()
  );
  const fileDiffContentRef = useRef<HTMLDivElement | null>(null);
  const lineElementMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const hoveredCommitterCardRef = useRef<HTMLDivElement | null>(null);
  const hideCommitterCardTimerRef = useRef<number | null>(null);
  const [lineCommentMarkers, setLineCommentMarkers] = useState<LineCommentMarker[]>(
    []
  );
  const [hoveredLineCommitterCard, setHoveredLineCommitterCard] =
    useState<HoveredLineCommitterCard | null>(null);

  const clickHint = useMemo(
    () => "点击变更行可展开行内评论，再次点击可收起",
    []
  );

  const lineAnnotations = useMemo<DiffLineAnnotation<LineAnnotationMeta>[]>(() => {
    if (!discussions || expandedThreadKeys.size === 0) {
      return [];
    }

    const annotations: DiffLineAnnotation<LineAnnotationMeta>[] = [];

    const appendBySide = (side: "additions" | "deletions") => {
      const sideMap = discussions.lineThreads[side];
      for (const [lineKey, threads] of Object.entries(sideMap)) {
        const lineNumber = Number.parseInt(lineKey, 10);
        if (!Number.isFinite(lineNumber)) continue;

        for (const thread of threads) {
          const threadKey = getDiscussionThreadKey(side, lineNumber, thread.id);
          if (!expandedThreadKeys.has(threadKey)) continue;

          annotations.push({
            side,
            lineNumber,
            metadata: {
              thread,
              side,
              lineNumber,
              threadKey,
            },
          });
        }
      }
    };

    appendBySide("additions");
    appendBySide("deletions");

    return annotations;
  }, [expandedThreadKeys, discussions]);

  const discussionLineNumbers = useMemo(() => {
    const additions = new Set<number>();
    const deletions = new Set<number>();
    const counts = {
      additions: new Map<number, number>(),
      deletions: new Map<number, number>(),
    };

    const appendSideLines = (
      sideMap: Record<number, DiscussionThreadView[]>,
      sideSet: Set<number>,
      sideCountMap: Map<number, number>
    ) => {
      for (const [lineKey, threads] of Object.entries(sideMap)) {
        const lineNumber = Number.parseInt(lineKey, 10);
        if (!Number.isFinite(lineNumber) || threads.length === 0) continue;
        sideSet.add(lineNumber);
        const noteCount = threads.reduce(
          (total, thread) => total + thread.notes.length,
          0
        );
        sideCountMap.set(lineNumber, noteCount);
      }
    };

    appendSideLines(
      discussions?.lineThreads.additions || {},
      additions,
      counts.additions
    );
    appendSideLines(
      discussions?.lineThreads.deletions || {},
      deletions,
      counts.deletions
    );

    return {
      additions,
      deletions,
      counts,
    };
  }, [discussions]);

  const recalculateLineCommentMarkers = useCallback(() => {
    const container = fileDiffContentRef.current;
    const hostElement = container?.querySelector<HTMLElement>("diffs-container");
    const root = hostElement?.shadowRoot;
    if (!container || !root) {
      lineElementMapRef.current.clear();
      setLineCommentMarkers([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const nextMarkers: LineCommentMarker[] = [];
    const nextLineElementMap = new Map<string, HTMLElement>();

    const lineElements = root.querySelectorAll<HTMLElement>("[data-line]");
    lineElements.forEach((lineElement) => {
      const lineType = lineElement.getAttribute("data-line-type");
      const side =
        lineType === "change-addition"
          ? "additions"
          : lineType === "change-deletion"
            ? "deletions"
            : null;
      if (side === null) return;

      const lineNumber = Number.parseInt(
        lineElement.getAttribute("data-line") || "",
        10
      );
      if (!Number.isFinite(lineNumber)) return;
      if (!discussionLineNumbers[side].has(lineNumber)) return;

      const numberColumn =
        lineElement.querySelector<HTMLElement>("[data-column-number]");
      if (!numberColumn) return;

      const count = discussionLineNumbers.counts[side].get(lineNumber) ?? 0;
      const numberRect = numberColumn.getBoundingClientRect();
      const markerSize = 16;
      const markerTop =
        numberRect.top -
        containerRect.top +
        container.scrollTop +
        (numberRect.height - markerSize) / 2;
      const markerLeft =
        numberRect.right -
        containerRect.left +
        container.scrollLeft +
        4;
      const key = getLineMarkerKey(side, lineNumber);

      nextLineElementMap.set(key, lineElement);
      nextMarkers.push({
        key,
        side,
        lineNumber,
        count,
        top: markerTop,
        left: markerLeft,
      });
    });

    nextMarkers.sort((a, b) => a.top - b.top || a.left - b.left);
    lineElementMapRef.current = nextLineElementMap;
    setLineCommentMarkers((prev) =>
      areLineMarkersEqual(prev, nextMarkers) ? prev : nextMarkers
    );
  }, [discussionLineNumbers]);

  const syncLineCommitterBadges = useCallback(() => {
    const container = fileDiffContentRef.current;
    const hostElement = container?.querySelector<HTMLElement>("diffs-container");
    const root = hostElement?.shadowRoot;
    if (!root) {
      return;
    }

    const lineElements = root.querySelectorAll<HTMLElement>("[data-line]");
    lineElements.forEach((lineElement) => {
      const lineType = lineElement.getAttribute("data-line-type");
      const side =
        lineType === "change-addition"
          ? "additions"
          : lineType === "change-deletion"
            ? "deletions"
            : null;
      const lineNumber = Number.parseInt(
        lineElement.getAttribute("data-line") || "",
        10
      );
      const contentColumn =
        lineElement.querySelector<HTMLElement>("[data-column-content]");
      if (!contentColumn) return;

      const existingBadge = contentColumn.querySelector<HTMLElement>(
        "[data-line-committer-badge]"
      );

      if (!side || !Number.isFinite(lineNumber)) {
        if (existingBadge) existingBadge.remove();
        contentColumn.style.removeProperty("padding-inline-end");
        return;
      }

      const authorInfo = lineLatestCommitters?.[side]?.[lineNumber];
      if (!authorInfo) {
        if (existingBadge) existingBadge.remove();
        contentColumn.style.removeProperty("padding-inline-end");
        return;
      }

      const badge = existingBadge || document.createElement("span");
      badge.setAttribute("data-line-committer-badge", "");
      badge.textContent = `${authorInfo.title}，${authorInfo.authorName}`;
      badge.title = `${authorInfo.title}，${authorInfo.authorName}，${new Date(authorInfo.createdAt).toLocaleString()}`;
      badge.style.position = "absolute";
      badge.style.right = "8px";
      badge.style.top = "50%";
      badge.style.transform = "translateY(-50%)";
      badge.style.maxWidth = "22rem";
      badge.style.overflow = "hidden";
      badge.style.textOverflow = "ellipsis";
      badge.style.whiteSpace = "nowrap";
      badge.style.pointerEvents = "none";
      badge.style.fontSize = "11px";
      badge.style.color = "color-mix(in srgb, var(--diffs-fg) 58%, transparent)";
      badge.style.opacity = "0.95";
      badge.style.background =
        "light-dark(rgba(248,250,252,0.72), rgba(15,23,42,0.6))";
      badge.style.padding = "0 6px";
      badge.style.borderRadius = "999px";
      badge.style.border =
        "1px solid color-mix(in srgb, var(--diffs-fg) 14%, transparent)";

      contentColumn.style.paddingInlineEnd = "23rem";

      if (!existingBadge) {
        contentColumn.appendChild(badge);
      }
    });
  }, [lineLatestCommitters]);

  useEffect(() => {
    const container = fileDiffContentRef.current;
    if (!container) return;

    const refresh = () => {
      setHoveredLineCommitterCard(null);
      recalculateLineCommentMarkers();
      syncLineCommitterBadges();
    };
    const rafId = requestAnimationFrame(refresh);
    const timerId = window.setTimeout(refresh, 64);
    container.addEventListener("scroll", refresh, { passive: true });
    const handlePointerLeave = () => setHoveredLineCommitterCard(null);
    container.addEventListener("pointerleave", handlePointerLeave);
    const handleWindowScroll = () => setHoveredLineCommitterCard(null);
    window.addEventListener("scroll", handleWindowScroll, {
      passive: true,
      capture: true,
    });

    const hostElement = container.querySelector<HTMLElement>("diffs-container");
    const resizeObserver = new ResizeObserver(refresh);
    resizeObserver.observe(container);
    if (hostElement) {
      resizeObserver.observe(hostElement);
    }

    return () => {
      if (hideCommitterCardTimerRef.current !== null) {
        window.clearTimeout(hideCommitterCardTimerRef.current);
        hideCommitterCardTimerRef.current = null;
      }
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      container.removeEventListener("scroll", refresh);
      container.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", handleWindowScroll, true);
      resizeObserver.disconnect();
    };
  }, [
    recalculateLineCommentMarkers,
    syncLineCommitterBadges,
    lineAnnotations,
    patch,
    resolvedTheme,
  ]);

  const openLineDetails = useCallback(
    (params: {
      annotationSide: "additions" | "deletions";
      lineNumber: number;
      lineType?: string;
      lineElement?: HTMLElement;
    }) => {
      if (
        params.lineType !== undefined &&
        params.lineType !== "change-addition" &&
        params.lineType !== "change-deletion"
      ) {
        return;
      }

      const lineThreads =
        discussions?.lineThreads[params.annotationSide]?.[
          params.lineNumber
        ] || [];

      if (lineThreads.length === 0) {
        return;
      }
      const threadKeys = lineThreads.map((thread) =>
        getDiscussionThreadKey(params.annotationSide, params.lineNumber, thread.id)
      );
      setExpandedThreadKeys((prev) => {
        const allExpanded = threadKeys.every((key) => prev.has(key));
        const next = new Set(prev);
        if (allExpanded) {
          threadKeys.forEach((key) => next.delete(key));
        } else {
          threadKeys.forEach((key) => next.add(key));
        }
        return next;
      });
    },
    [discussions]
  );

  const handleLineCommentMarkerClick = useCallback((marker: LineCommentMarker) => {
    const container = fileDiffContentRef.current;
    const root = container
      ?.querySelector<HTMLElement>("diffs-container")
      ?.shadowRoot;
    const targetLineType =
      marker.side === "additions" ? "change-addition" : "change-deletion";
    const liveLineElements = root
      ? Array.from(
          root.querySelectorAll<HTMLElement>(`[data-line="${marker.lineNumber}"]`)
        )
      : [];
    const matchedLineElement =
      liveLineElements.find(
        (element) => element.getAttribute("data-line-type") === targetLineType
      ) || lineElementMapRef.current.get(marker.key);
    if (!matchedLineElement) return;

    openLineDetails({
      annotationSide: marker.side,
      lineNumber: marker.lineNumber,
      lineType: targetLineType,
      lineElement: matchedLineElement,
    });
  }, [openLineDetails]);

  /** 处理变更行点击，显示对应最新提交者和行级讨论 */
  const handleDiffLineClick = useCallback((lineData: {
    annotationSide: "additions" | "deletions";
    lineNumber: number;
    lineType?: string;
    lineElement: HTMLElement;
  }) => {
    if (
      lineData.lineType !== "change-addition" &&
      lineData.lineType !== "change-deletion"
    ) {
      return;
    }

    openLineDetails(lineData);
  }, [openLineDetails]);

  const handleDiffLineEnter = useCallback((lineData: {
    annotationSide: "additions" | "deletions";
    lineNumber: number;
    lineType: string;
    lineElement: HTMLElement;
  }) => {
    if (hideCommitterCardTimerRef.current !== null) {
      window.clearTimeout(hideCommitterCardTimerRef.current);
      hideCommitterCardTimerRef.current = null;
    }

    if (
      lineData.lineType !== "change-addition" &&
      lineData.lineType !== "change-deletion"
    ) {
      setHoveredLineCommitterCard(null);
      return;
    }

    const authorInfo = lineLatestCommitters?.[lineData.annotationSide]?.[
      lineData.lineNumber
    ];
    if (!authorInfo) {
      setHoveredLineCommitterCard(null);
      return;
    }

    const container = fileDiffContentRef.current;
    if (!container) return;

    const badgeElement = lineData.lineElement.querySelector<HTMLElement>(
      "[data-line-committer-badge]"
    );
    const anchorRect =
      badgeElement?.getBoundingClientRect() ??
      lineData.lineElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const visibleWidth = container.clientWidth;
    const visibleHeight = container.clientHeight;
    const cardWidth = Math.max(220, Math.min(360, visibleWidth - 16));
    const estimatedCardHeight = 96;
    const minLeft = container.scrollLeft + 8;
    const maxLeft = container.scrollLeft + visibleWidth - cardWidth - 8;
    const anchorCenter =
      anchorRect.left -
      containerRect.left +
      container.scrollLeft +
      anchorRect.width / 2;
    const preferredLeft = anchorCenter - cardWidth / 2;
    const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

    const anchorTop =
      anchorRect.top - containerRect.top + container.scrollTop;
    const anchorBottom =
      anchorRect.bottom - containerRect.top + container.scrollTop;
    const visibleTop = container.scrollTop + 8;
    const visibleBottom = container.scrollTop + visibleHeight - 8;
    const belowTop = anchorBottom + 10;
    const aboveTop = anchorTop - estimatedCardHeight - 10;
    const placement =
      belowTop + estimatedCardHeight <= visibleBottom
        ? "bottom"
        : "top";
    const top =
      placement === "bottom" ? belowTop : Math.max(visibleTop, aboveTop);
    const arrowLeft = Math.min(Math.max(anchorCenter - left, 14), cardWidth - 14);

    setHoveredLineCommitterCard({
      top,
      left,
      width: cardWidth,
      arrowLeft,
      placement,
      anchorTop,
      anchorBottom,
      side: lineData.annotationSide,
      lineNumber: lineData.lineNumber,
      authorInfo,
    });
  }, [lineLatestCommitters]);

  useEffect(() => {
    const card = hoveredCommitterCardRef.current;
    const container = fileDiffContentRef.current;
    if (!card || !container || !hoveredLineCommitterCard) {
      return;
    }

    const visibleTop = container.scrollTop + 8;
    const visibleBottom = container.scrollTop + container.clientHeight - 8;
    const cardHeight = card.offsetHeight;
    const belowTop = hoveredLineCommitterCard.anchorBottom + 10;
    const aboveTop = hoveredLineCommitterCard.anchorTop - cardHeight - 10;
    const spaceBelow = visibleBottom - hoveredLineCommitterCard.anchorBottom;
    const spaceAbove = hoveredLineCommitterCard.anchorTop - visibleTop;
    const nextPlacement =
      belowTop + cardHeight <= visibleBottom || spaceBelow >= spaceAbove
        ? "bottom"
        : "top";
    const rawTop = nextPlacement === "bottom" ? belowTop : aboveTop;
    const nextTop = Math.min(
      Math.max(rawTop, visibleTop),
      Math.max(visibleTop, visibleBottom - cardHeight)
    );

    setHoveredLineCommitterCard((prev) => {
      if (!prev) return prev;
      if (
        prev.placement === nextPlacement &&
        Math.abs(prev.top - nextTop) < 0.5
      ) {
        return prev;
      }
      return {
        ...prev,
        placement: nextPlacement,
        top: nextTop,
      };
    });
  }, [hoveredLineCommitterCard]);

  const scheduleHideCommitterCard = useCallback(() => {
    if (hideCommitterCardTimerRef.current !== null) {
      window.clearTimeout(hideCommitterCardTimerRef.current);
    }
    hideCommitterCardTimerRef.current = window.setTimeout(() => {
      setHoveredLineCommitterCard(null);
      hideCommitterCardTimerRef.current = null;
    }, 90);
  }, []);

  const patchDiffOptions = useMemo(
    () => ({
      themeType: resolvedTheme,
      diffStyle: "unified" as const,
      disableLineNumbers: false,
      overflow: "scroll" as const,
      onLineClick: handleDiffLineClick,
      onLineEnter: handleDiffLineEnter,
      onLineLeave: scheduleHideCommitterCard,
    }),
    [
      resolvedTheme,
      handleDiffLineClick,
      handleDiffLineEnter,
      scheduleHideCommitterCard,
    ]
  );

  return (
    <TogglePanel
      header={
        <FileDiffHeader
          diff={diff}
          commitAuthors={commitAuthors}
        />
      }
      headerActions={<FileDiffActions diff={diff} />}
      defaultExpanded={defaultExpanded}
      onToggle={onToggle}
      className={`file-diff-panel ${isSelected ? "selected" : ""}`}
      unmountWhenCollapsed={true}
    >
      <div
        className="file-diff-content"
        ref={fileDiffContentRef}
      >
        <PatchDiff
          patch={patch}
          lineAnnotations={lineAnnotations}
          renderAnnotation={(annotation) => {
            if (!annotation.metadata) return null;
            const { thread, side, lineNumber, threadKey } = annotation.metadata;

            return (
              <div
                className="gitlab-inline-thread"
                data-thread-key={threadKey}
              >
                <div className="gitlab-inline-thread-head">
                  <span>
                    行 {lineNumber} · {side === "additions" ? "新增" : "删除"} · 讨论 #{thread.id.slice(0, 8)}
                  </span>
                  {thread.resolved && (
                    <span className="gitlab-discussion-resolved">已解决</span>
                  )}
                </div>
                <div className="gitlab-inline-thread-notes">
                  {thread.notes.map((note) => (
                    <div
                      key={note.id}
                      className="gitlab-inline-note"
                    >
                      <div className="gitlab-inline-note-meta">
                        <span>{note.authorName}</span>
                        <span>·</span>
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="gitlab-inline-note-body">{note.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
          options={patchDiffOptions}
        />
        {lineCommentMarkers.length > 0 && (
          <div className="file-diff-comment-marker-layer">
            {lineCommentMarkers.map((marker) => (
              <button
                key={marker.key}
                type="button"
                className="file-diff-comment-marker"
                style={{ top: `${marker.top}px`, left: `${marker.left}px` }}
                onClick={() => handleLineCommentMarkerClick(marker)}
                title={`查看该行评论（${marker.count}）`}
                aria-label={`查看该行评论，当前 ${marker.count} 条`}
              >
                <MessageCircle
                  size={12}
                  strokeWidth={2}
                  aria-hidden="true"
                  focusable="false"
                />
                <span
                  className="file-diff-comment-marker-badge"
                  aria-hidden="true"
                >
                  {marker.count}
                </span>
              </button>
            ))}
          </div>
        )}
        {hoveredLineCommitterCard && (
          <div
            ref={hoveredCommitterCardRef}
            className={`line-committer-hover-card line-committer-hover-card-${hoveredLineCommitterCard.placement}`}
            style={{
              top: `${hoveredLineCommitterCard.top}px`,
              left: `${hoveredLineCommitterCard.left}px`,
              width: `${hoveredLineCommitterCard.width}px`,
            }}
          >
            <div
              className="line-committer-hover-card-arrow"
              style={{ left: `${hoveredLineCommitterCard.arrowLeft}px` }}
            />
            <div className="line-committer-hover-card-title">
              {hoveredLineCommitterCard.side === "additions" ? "新增" : "删除"}行{" "}
              {hoveredLineCommitterCard.lineNumber} 的最新提交者
            </div>
            <div className="line-committer-hover-card-body">
              <span>{hoveredLineCommitterCard.authorInfo.authorName}</span>
              <span>·</span>
              <span>{hoveredLineCommitterCard.authorInfo.title}</span>
              <span>·</span>
              <span>
                {new Date(
                  hoveredLineCommitterCard.authorInfo.createdAt
                ).toLocaleString()}
              </span>
            </div>
          </div>
        )}

      </div>

      {/* AI 审查结果区域 - 始终显示以允许手动输入评审意见 */}
      {onSubmitComment && (
        <div className="file-ai-review-section">
          <FileAIReviewResult
            filePath={filePath}
            result={aiReviewResult ?? null}
            loading={aiReviewLoading}
            error={aiReviewError}
            repoId={repoId}
            reviewIid={reviewIid}
            onSubmitComment={onSubmitComment}
            fileDiscussions={discussions?.fileThreads || []}
            fileCommentCount={discussions?.totalCount || 0}
            lineLatestCommitters={lineLatestCommitters}
          />
        </div>
      )}
      <div className="line-committer-hint">{clickHint}</div>
    </TogglePanel>
  );
}
