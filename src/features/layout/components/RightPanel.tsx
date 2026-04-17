import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Key,
  Activity,
  Bot,
  GitMerge,
  Clock3,
  CheckCircle2,
  Play,
  FileCode,
  ListChecks,
  Square,
} from "lucide-react";
import { AIReviewPanel } from "../../ai/components/AIReviewPanel";
import { useApp } from "../../../contexts/AppContext";
import { useAIReview } from "../../../hooks/useAIReview";
import { useFileAIReviewContext } from "../../../hooks/useFileAIReviewContext";
import {
  useMergeRequestChanges,
  useMergeRequestMergeAction,
  useMergeRequestReadyAction,
  useMergeRequests,
} from "../../../hooks/useGitLab";
import type { GitLabMergeRequest, MergeStrategy } from "../../../types/gitlab";
import { ConfirmationDialog } from "../../../components/ui/confirmation-dialog";

type FileReviewMode = "single" | "batch";

const MERGE_STATUS_LABELS: Record<string, string> = {
  mergeable: "可合并",
  checking: "GitLab 正在检查合并状态",
  unchecked: "GitLab 尚未完成合并检查",
  cannot_be_merged: "存在冲突或不可合并",
  cannot_be_merged_recheck: "合并状态需要重新检查",
  ci_must_pass: "流水线必须通过后才能合并",
  ci_still_running: "流水线仍在运行",
  discussions_not_resolved: "存在未解决讨论",
  not_approved: "审批未满足要求",
  draft_status: "MR 仍处于 Draft/WIP 状态",
  blocked_status: "MR 被阻塞",
  requested_changes: "评审要求修改后才能合并",
  status_checks_must_pass: "状态检查必须通过后才能合并",
};

/** 判断 MR 是否仍处于 Draft/WIP 状态 */
function isDraftMergeRequest(mr: GitLabMergeRequest | null | undefined): boolean {
  if (!mr) {
    return false;
  }

  return Boolean(
    mr.draft ||
      mr.work_in_progress ||
      mr.detailed_merge_status === "draft_status" ||
      /^\s*(?:\[Draft\]|\(Draft\)|Draft:|WIP:)/i.test(mr.title)
  );
}

/** 生成 MR 合并状态提示 */
function getMergeStatusHint(
  mr: GitLabMergeRequest | null | undefined,
  strategy: MergeStrategy
): string | null {
  if (!mr) {
    return null;
  }

  if (mr.has_conflicts) {
    return "GitLab 标记该 MR 存在冲突，需先解决冲突后再合并。";
  }

  if (mr.blocking_discussions_resolved === false) {
    return "GitLab 标记该 MR 仍有未解决讨论，需全部解决后再合并。";
  }

  const status = mr.detailed_merge_status || mr.merge_status;
  if (!status) {
    return null;
  }

  const label = MERGE_STATUS_LABELS[status] || status;

  if (status === "mergeable") {
    return `GitLab 合并状态：${label}。`;
  }

  if (
    strategy === "pipeline" &&
    ["ci_must_pass", "ci_still_running"].includes(status)
  ) {
    return `GitLab 合并状态：${label}。当前选择“流水线后自动合并”，GitLab 会在条件满足后尝试合并。`;
  }

  return `GitLab 合并状态：${label}。若直接合并返回 405，请先在 GitLab 页面处理对应检查项。`;
}

/** 判断两个 MR 记录是否指向同一个 GitLab MR */
function isSameMergeRequest(
  left: GitLabMergeRequest | null | undefined,
  right: GitLabMergeRequest | null | undefined
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.id === right.id || left.iid === right.iid;
}

/** 从当前 MR 列表中获取当前 MR 后面的下一条记录 */
function getNextMergeRequest(
  mergeRequests: GitLabMergeRequest[],
  currentMr: GitLabMergeRequest
): GitLabMergeRequest | null {
  const currentIndex = mergeRequests.findIndex((item) =>
    isSameMergeRequest(item, currentMr)
  );

  if (currentIndex < 0 || currentIndex >= mergeRequests.length - 1) {
    return null;
  }

  return mergeRequests[currentIndex + 1];
}

/** 用刷新后的 MR 列表修正倒计时结束时要跳转的目标 */
function resolveNextMergeRequestAfterRefresh(
  refreshedMergeRequests: GitLabMergeRequest[],
  currentMr: GitLabMergeRequest,
  preferredNextMr: GitLabMergeRequest | null,
  useFirstRefreshedFallback: boolean
): GitLabMergeRequest | null {
  if (preferredNextMr) {
    const refreshedPreferred = refreshedMergeRequests.find((item) =>
      isSameMergeRequest(item, preferredNextMr)
    );
    return refreshedPreferred || preferredNextMr;
  }

  if (!useFirstRefreshedFallback) {
    return null;
  }

  const fallbackMr = refreshedMergeRequests.find(
    (item) => !isSameMergeRequest(item, currentMr)
  );

  return fallbackMr || null;
}

/**
 * 右侧面板组件 - 显示 AI 审查、Token 信息、应用状态
 */
export function RightPanel() {
  const [fileReviewMode, setFileReviewMode] = useState<FileReviewMode>("single");
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>("immediate");
  const [mergeCountdown, setMergeCountdown] = useState<number | null>(null);
  const [mergeQueuedMrId, setMergeQueuedMrId] = useState<number | null>(null);
  const [nextMrAfterCountdown, setNextMrAfterCountdown] =
    useState<GitLabMergeRequest | null>(null);
  const [mergeSubmitted, setMergeSubmitted] = useState(false);
  const [mergeSuccessHint, setMergeSuccessHint] = useState<string | null>(null);
  const [confirmMergeDialogOpen, setConfirmMergeDialogOpen] = useState(false);
  const [shouldMarkDraftReady, setShouldMarkDraftReady] = useState(false);
  const previousSelectedMrIdRef = useRef<number | null>(null);
  const [state, actions] = useApp();
  const {
    config,
    isConnected,
    error: appError,
    selectedProject,
    selectedMR,
    selectedFileIndex,
    selectedFileDiff,
  } = state;
  const {
    loading: reviewLoading,
    result: reviewResult,
    error: reviewError,
    review,
  } = useAIReview();
  const {
    merge,
    loading: mergeLoading,
    error: mergeError,
    reset: resetMergeAction,
  } = useMergeRequestMergeAction();
  const {
    markReady,
    loading: readyLoading,
    error: readyError,
    reset: resetReadyAction,
  } = useMergeRequestReadyAction();

  // 文件级 AI Review - 使用 Context 共享状态
  const {
    getFileState,
    reviewFile,
    batchState,
    reviewAllFiles,
    stopBatchReview,
    resetBatchReview,
    clearAllResults,
  } = useFileAIReviewContext();

  // 获取 MR 变更用于 AI 审查
  const { mrWithChanges } = useMergeRequestChanges(
    selectedProject?.id,
    selectedMR?.iid
  );
  const { mergeRequests, fetchMergeRequests } = useMergeRequests(
    selectedProject?.id
  );

  // 处理开始 MR 级别审查
  const handleReview = () => {
    if (mrWithChanges?.changes) {
      // 合并所有文件的 diff
      const fullDiff = mrWithChanges.changes
        .map((change) => {
          const header = `--- a/${change.old_path}\n+++ b/${change.new_path}\n`;
          return header + (change.diff || "");
        })
        .join("\n");
      review(fullDiff);
    }
  };

  // 处理文件级审查
  const handleFileReview = () => {
    if (selectedMR && selectedFileDiff && selectedFileIndex !== null) {
      const filePath =
        selectedFileDiff.new_path || selectedFileDiff.old_path || "";
      const diffContent = `--- a/${selectedFileDiff.old_path}\n+++ b/${
        selectedFileDiff.new_path
      }\n${selectedFileDiff.diff || ""}`;
      reviewFile(diffContent, filePath, config.ai);
    }
  };

  const hasAIConfig = useMemo(() => {
    if (!config.ai.providerId || !config.ai.modelId) {
      return false;
    }
    const provider = config.ai.modeProviders.find(
      (item) => item.id === config.ai.providerId
    );
    const model = provider?.models.find((item) => item.id === config.ai.modelId);
    return Boolean(provider?.id && provider?.apiUrl && provider?.apiKey && model?.id);
  }, [config.ai]);

  const canReviewFile = !!(selectedMR && selectedFileDiff && hasAIConfig);

  // 获取当前选中文件的审查状态
  const selectedFilePath =
    selectedMR && selectedFileDiff
      ? selectedFileDiff.new_path || selectedFileDiff.old_path || ""
      : "";
  const fileReviewState = selectedFilePath
    ? getFileState(selectedFilePath)
    : null;
  const mrChanges = mrWithChanges?.changes || [];

  const handleBatchReview = () => {
    if (!mrChanges.length) return;
    reviewAllFiles(mrChanges, config.ai);
  };

  const batchCanStart = mrChanges.length > 0 && hasAIConfig && !batchState.running;
  const batchFinishedCount = batchState.completed + batchState.failed;
  const batchProgress =
    batchState.total > 0
      ? Math.min(100, Math.round((batchFinishedCount / batchState.total) * 100))
      : 0;
  const noSelectedMr = !selectedMR;
  const noSelectedFile = !selectedFileDiff;
  const selectedMrId = selectedMR?.id ?? null;
  const currentMergeRequest = mrWithChanges || selectedMR;
  const mergeStatusHint = useMemo(
    () => getMergeStatusHint(currentMergeRequest, mergeStrategy),
    [currentMergeRequest, mergeStrategy]
  );
  const isCurrentMrDraft = isDraftMergeRequest(currentMergeRequest);
  const isMergeActionLoading = mergeLoading || readyLoading;

  const canApproveMerge = Boolean(
    isConnected &&
      selectedProject?.id &&
      selectedMR?.iid &&
      selectedMR.state === "opened"
  );

  const handleApproveMerge = useCallback(() => {
    if (!canApproveMerge || !selectedProject || !selectedMR) {
      return;
    }

    setShouldMarkDraftReady(isDraftMergeRequest(currentMergeRequest));
    setConfirmMergeDialogOpen(true);
  }, [canApproveMerge, selectedProject, selectedMR, currentMergeRequest]);

  const handleConfirmMerge = useCallback(async () => {
    if (!canApproveMerge || !selectedProject || !selectedMR) {
      return;
    }

    const hasCurrentMrInList = mergeRequests.some((item) =>
      isSameMergeRequest(item, selectedMR)
    );
    const nextMr = getNextMergeRequest(mergeRequests, selectedMR);

    setMergeSuccessHint(null);
    setMergeCountdown(null);
    setMergeQueuedMrId(null);
    setMergeSubmitted(false);
    setNextMrAfterCountdown(nextMr);

    try {
      const readyMr =
        shouldMarkDraftReady && isCurrentMrDraft
          ? await markReady(selectedProject.id, selectedMR.iid)
          : null;
      const mrForMerge = readyMr || currentMergeRequest || selectedMR;
      const headSha = mrForMerge.sha || mrForMerge.diff_refs?.head_sha;

      if (readyMr) {
        actions.selectMR(readyMr);
      }

      await merge(selectedProject.id, selectedMR.iid, {
        mergeWhenPipelineSucceeds: mergeStrategy === "pipeline",
        shouldRemoveSourceBranch: false,
        squash: false,
        sha: headSha,
      });

      setMergeQueuedMrId(selectedMR.id);
      setMergeSubmitted(true);
      setMergeCountdown(5);
      void fetchMergeRequests().then((refreshedMergeRequests) => {
        setNextMrAfterCountdown((currentNextMr) =>
          resolveNextMergeRequestAfterRefresh(
            refreshedMergeRequests,
            selectedMR,
            currentNextMr,
            !hasCurrentMrInList
          )
        );
      });
    } catch {
      // 错误状态由 Hook 管理并在界面显示
    }
  }, [
    canApproveMerge,
    selectedProject,
    selectedMR,
    mergeRequests,
    merge,
    markReady,
    mergeStrategy,
    shouldMarkDraftReady,
    isCurrentMrDraft,
    currentMergeRequest,
    actions,
    fetchMergeRequests,
  ]);

  useEffect(() => {
    if (mergeCountdown === null) {
      return;
    }

    if (mergeCountdown <= 0) {
      if (nextMrAfterCountdown) {
        actions.selectMR(nextMrAfterCountdown);
        setMergeSuccessHint(null);
      } else {
        setMergeSuccessHint("当前列表已处理完成");
      }

      setMergeCountdown(null);
      setMergeQueuedMrId(null);
      setNextMrAfterCountdown(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setMergeCountdown((prev) => {
        if (prev === null) return null;
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [actions, mergeCountdown, nextMrAfterCountdown]);

  useEffect(() => {
    if (mergeCountdown === null || mergeQueuedMrId === null) {
      return;
    }

    if (selectedMR?.id !== mergeQueuedMrId) {
      setMergeCountdown(null);
      setMergeQueuedMrId(null);
      setNextMrAfterCountdown(null);
      setMergeSuccessHint(null);
      setMergeSubmitted(false);
    }
  }, [mergeCountdown, mergeQueuedMrId, selectedMR?.id]);

  useEffect(() => {
    if (previousSelectedMrIdRef.current === selectedMrId) {
      return;
    }
    previousSelectedMrIdRef.current = selectedMrId;

    setFileReviewMode("single");
    resetBatchReview();
    clearAllResults();
    setMergeCountdown(null);
    setMergeQueuedMrId(null);
    setNextMrAfterCountdown(null);
    setMergeSubmitted(false);
    setMergeSuccessHint(null);
    setShouldMarkDraftReady(false);
    resetMergeAction();
    resetReadyAction();
  }, [
    selectedMrId,
    resetBatchReview,
    clearAllResults,
    resetMergeAction,
    resetReadyAction,
  ]);

  return (
    <aside className="right-panel">
      <div className="right-panel-scroll">
        {/* AI 审查面板 */}
        <div className="right-panel-section">
          <div className="right-panel-header">
            <h3 className="right-panel-title">
              <Bot
                size={14}
                style={{ marginRight: 8 }}
              />
              AI 审查
            </h3>
          </div>
          <div className="right-panel-body">
            {appError && (
              <div className="file-review-error" style={{ marginBottom: 12 }}>
                {appError}
              </div>
            )}
            {noSelectedMr && (
              <div className="ai-review-top-tip">请先选择一个 MR</div>
            )}
            <div
              className={`ai-review-panel file-review-mode-card ${
                noSelectedMr ? "panel-disabled" : ""
              }`}
            >
              <div className="ai-review-header">
                <ListChecks size={16} />
                <span>文件评审模式</span>
              </div>
              <div className="file-review-mode-switch">
                <button
                  className={`file-review-mode-btn ${
                    fileReviewMode === "single" ? "active" : ""
                  }`}
                  onClick={() => setFileReviewMode("single")}
                  disabled={noSelectedMr}
                >
                  单文件评审
                </button>
                <button
                  className={`file-review-mode-btn ${
                    fileReviewMode === "batch" ? "active" : ""
                  }`}
                  onClick={() => setFileReviewMode("batch")}
                  disabled={noSelectedMr}
                >
                  PR 批量评审
                </button>
              </div>
            </div>

            {fileReviewMode === "single" ? (
              <div
                className={`ai-review-panel file-review-card ${
                  noSelectedMr || noSelectedFile ? "panel-disabled" : ""
                }`}
              >
                <div className="ai-review-header">
                  <FileCode size={16} />
                  <span className="file-name">
                    {selectedFilePath
                      ? selectedFilePath.split("/").pop()
                      : "未选择文件"}
                  </span>
                </div>
                <button
                  className="btn btn-primary file-review-btn"
                  onClick={handleFileReview}
                  disabled={!canReviewFile || fileReviewState?.loading}
                >
                  {fileReviewState?.loading ? (
                    <>
                      <span className="spinner-small" />
                      审查中...
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      执行代码审查
                    </>
                  )}
                </button>
                {!noSelectedMr && !selectedFileDiff && (
                  <div className="file-review-hint">请先在中间区域选择一个文件</div>
                )}
                {fileReviewState?.error && (
                  <div className="file-review-error">
                    {fileReviewState.error}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`ai-review-panel file-review-card ${
                  noSelectedMr ? "panel-disabled" : ""
                }`}
              >
                <div className="ai-review-header">
                  <ListChecks size={16} />
                  <span className="file-name">当前 PR 共 {mrChanges.length} 个文件</span>
                </div>
                <div className="batch-review-progress">
                  <div className="batch-review-progress-header">
                    <span>进度</span>
                    <span>
                      {batchFinishedCount}/{batchState.total || mrChanges.length}
                    </span>
                  </div>
                  <div className="batch-review-progress-track">
                    <div
                      className="batch-review-progress-bar"
                      style={{ width: `${batchProgress}%` }}
                    />
                  </div>
                  {batchState.currentFilePath && (
                    <div
                      className="batch-review-current-file"
                      title={batchState.currentFilePath}
                    >
                      正在评审: {batchState.currentFilePath}
                    </div>
                  )}
                  {batchState.failed > 0 && (
                    <div className="file-review-error">
                      已失败 {batchState.failed} 个文件，请在文件列表查看详情
                    </div>
                  )}
                  {batchState.stopped && !batchState.running && (
                    <div className="file-review-hint">
                      批量评审已手动停止（当前文件完成后生效）
                    </div>
                  )}
                </div>
                {batchState.running ? (
                  <button
                    className="btn btn-secondary file-review-btn"
                    onClick={stopBatchReview}
                  >
                    <Square size={14} />
                    停止批量评审
                  </button>
                ) : (
                  <button
                    className="btn btn-primary file-review-btn"
                    onClick={handleBatchReview}
                    disabled={!batchCanStart}
                  >
                    <Play size={14} />
                    批量逐一评审全部文件
                  </button>
                )}
              </div>
            )}

            {/* 全局 AI 审查面板 */}
            <AIReviewPanel
              result={reviewResult}
              loading={reviewLoading}
              error={reviewError}
              onReview={handleReview}
            />

            <div
              className={`ai-review-panel merge-action-card ${
                noSelectedMr ? "panel-disabled" : ""
              }`}
            >
              <div className="ai-review-header">
                <GitMerge size={16} />
                <span>通过合并</span>
              </div>
              <div className="merge-strategy-radio-group">
                <label className="merge-strategy-radio-item">
                  <input
                    type="radio"
                    name="merge-strategy"
                    checked={mergeStrategy === "immediate"}
                    onChange={() => setMergeStrategy("immediate")}
                    disabled={
                      noSelectedMr || isMergeActionLoading || mergeCountdown !== null
                    }
                  />
                  <span>立即合并</span>
                </label>
                <label className="merge-strategy-radio-item">
                  <input
                    type="radio"
                    name="merge-strategy"
                    checked={mergeStrategy === "pipeline"}
                    onChange={() => setMergeStrategy("pipeline")}
                    disabled={
                      noSelectedMr || isMergeActionLoading || mergeCountdown !== null
                    }
                  />
                  <span>流水线后自动合并</span>
                </label>
              </div>
              <button
                className="btn btn-primary file-review-btn merge-approve-btn"
                onClick={handleApproveMerge}
                disabled={
                  !canApproveMerge ||
                  isMergeActionLoading ||
                  mergeCountdown !== null ||
                  mergeSubmitted
                }
              >
                {isMergeActionLoading ? (
                  <>
                    <span className="spinner-small" />
                    {readyLoading ? "取消草稿中..." : "提交中..."}
                  </>
                ) : mergeSubmitted ? (
                  <>
                    <CheckCircle2 size={14} />
                    已通过合并
                  </>
                ) : (
                  <>
                    <GitMerge size={14} />
                    通过合并
                  </>
                )}
              </button>
              {mergeCountdown !== null && (
                <div className="merge-countdown-hint">
                  <Clock3 size={12} />
                  {nextMrAfterCountdown
                    ? `${mergeCountdown}s 后自动跳转到下一个 MR`
                    : `${mergeCountdown}s 后刷新 MR 列表`}
                </div>
              )}
              {(mergeError || readyError) && (
                <div className="file-review-error">{readyError || mergeError}</div>
              )}
              {mergeStatusHint && (
                <div className="merge-status-hint">{mergeStatusHint}</div>
              )}
              {isCurrentMrDraft && (
                <div className="merge-status-hint">
                  当前 MR 是 Draft，合并前需要取消草稿状态。
                </div>
              )}
              {mergeSuccessHint && (
                <div className="merge-completion-hint">{mergeSuccessHint}</div>
              )}
              {selectedMR && selectedMR.state !== "opened" && (
                <div className="file-review-hint">
                  当前 MR 状态为 {selectedMR.state}，不可执行通过合并
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 连接状态 */}
        <div className="right-panel-section">
          <div className="right-panel-header">
            <h3 className="right-panel-title">
              <Key
                size={14}
                style={{ marginRight: 8 }}
              />
              连接状态
            </h3>
          </div>
          <div className="right-panel-body">
            <div className="config-item">
              <label>GitLab</label>
              <span
                className={`config-value ${
                  isConnected ? "status-success" : "status-warning"
                }`}
              >
                {isConnected ? "已连接" : "未连接"}
              </span>
            </div>
            <div className="config-item">
              <label>AI (API)</label>
              <span
                  className={`config-value ${
                    hasAIConfig ? "status-success" : "status-warning"
                  }`}
                >
                  {hasAIConfig ? "已配置" : "未配置"}
              </span>
            </div>
          </div>
        </div>

        {/* 应用状态 */}
        <div className="right-panel-section">
          <div className="right-panel-header">
            <h3 className="right-panel-title">
              <Activity
                size={14}
                style={{ marginRight: 8 }}
              />
              应用状态
            </h3>
          </div>
          <div className="right-panel-body">
            <div className="config-item">
              <label>版本</label>
              <span className="config-value">v0.1.0</span>
            </div>
            <div className="config-item">
              <label>状态</label>
              <span className="config-value status-success">就绪</span>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={confirmMergeDialogOpen}
        onOpenChange={setConfirmMergeDialogOpen}
        title="确认合并 MR"
        description={`确认通过合并该 MR 吗？

MR !${selectedMR?.iid} ${selectedMR?.title}
${selectedMR?.source_branch} -> ${selectedMR?.target_branch}
策略：${mergeStrategy === "pipeline" ? "流水线通过后自动合并（GitLab CI/CD 通过后）" : "立即合并"}
${mergeStatusHint ? `当前状态：${mergeStatusHint}` : ""}

此操作不可撤销。`}
        confirmText="确认合并"
        cancelText="取消"
        onConfirm={handleConfirmMerge}
        variant="destructive"
      >
        {isCurrentMrDraft && (
          <label className="merge-ready-checkbox">
            <input
              type="checkbox"
              checked={shouldMarkDraftReady}
              onChange={(event) => setShouldMarkDraftReady(event.target.checked)}
              disabled={isMergeActionLoading}
            />
            <span>
              先取消草稿状态（标记为 Ready），再执行当前合并策略
            </span>
          </label>
        )}
      </ConfirmationDialog>
    </aside>
  );
}
