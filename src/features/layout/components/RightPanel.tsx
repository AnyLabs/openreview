import { useEffect, useMemo, useRef, useState } from "react";
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
  useReviewChanges,
  useReviewMergeAction,
  useReviews,
} from "../../../hooks/usePlatform";
import type { MergeStrategy } from "../../../types/platform";
import { getPlatformLabels } from "../../../constants/platform-labels";

type FileReviewMode = "single" | "batch";

/**
 * 右侧面板组件 - 显示 AI 审查、Token 信息、应用状态
 */
export function RightPanel() {
  const [fileReviewMode, setFileReviewMode] = useState<FileReviewMode>("single");
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>("immediate");
  const [mergeCountdown, setMergeCountdown] = useState<number | null>(null);
  const [mergeQueuedReviewId, setMergeQueuedReviewId] = useState<number | null>(null);
  const [nextReviewAfterCountdown, setNextReviewAfterCountdown] =
    useState<ReturnType<typeof useReviews>["reviews"][number] | null>(null);
  const [mergeSubmitted, setMergeSubmitted] = useState(false);
  const [mergeSuccessHint, setMergeSuccessHint] = useState<string | null>(null);
  const previousSelectedReviewIdRef = useRef<number | null>(null);
  const [state, actions] = useApp();
  const {
    config,
    isConnected,
    selectedRepo,
    selectedReview,
    selectedFileIndex,
    selectedFileDiff,
    activePlatform,
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
  } = useReviewMergeAction();

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

  // 获取 Review 变更用于 AI 审查
  const { reviewWithChanges } = useReviewChanges(
    selectedRepo?.id,
    selectedReview?.iid
  );
  const { reviews, fetchReviews } = useReviews(selectedRepo?.id);

  // 获取当前平台的文案
  const platformLabels = getPlatformLabels(activePlatform);

  // 处理开始 Review 级别审查
  const handleReview = () => {
    if (reviewWithChanges?.changes) {
      // 合并所有文件的 diff
      const fullDiff = reviewWithChanges.changes
        .map((change) => {
          const header = `--- a/${change.oldPath}\n+++ b/${change.newPath}\n`;
          return header + (change.diff || "");
        })
        .join("\n");
      review(fullDiff);
    }
  };

  // 处理文件级审查
  const handleFileReview = () => {
    if (selectedReview && selectedFileDiff && selectedFileIndex !== null) {
      const filePath =
        selectedFileDiff.newPath || selectedFileDiff.oldPath || "";
      const diffContent = `--- a/${selectedFileDiff.oldPath}\n+++ b/${
        selectedFileDiff.newPath
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

  const canReviewFile = !!(selectedReview && selectedFileDiff && hasAIConfig);

  // 获取当前选中文件的审查状态
  const selectedFilePath =
    selectedReview && selectedFileDiff
      ? selectedFileDiff.newPath || selectedFileDiff.oldPath || ""
      : "";
  const fileReviewState = selectedFilePath
    ? getFileState(selectedFilePath)
    : null;
  const reviewChanges = reviewWithChanges?.changes || [];

  const handleBatchReview = () => {
    if (!reviewChanges.length) return;
    reviewAllFiles(reviewChanges, config.ai);
  };

  const batchCanStart = reviewChanges.length > 0 && hasAIConfig && !batchState.running;
  const batchFinishedCount = batchState.completed + batchState.failed;
  const batchProgress =
    batchState.total > 0
      ? Math.min(100, Math.round((batchFinishedCount / batchState.total) * 100))
      : 0;
  const noSelectedReview = !selectedReview;
  const noSelectedFile = !selectedFileDiff;
  const selectedReviewId = selectedReview?.id ?? null;

  const canApproveMerge = Boolean(
    isConnected &&
      selectedRepo?.id &&
      selectedReview?.iid &&
      selectedReview.state === "open"
  );

  const handleApproveMerge = async () => {
    if (!canApproveMerge || !selectedRepo || !selectedReview) {
      return;
    }

    const strategyLabel =
      mergeStrategy === "pipeline"
        ? "流水线通过后自动合并（GitLab CI/CD 通过后）"
        : "立即合并";

    const confirmed = window.confirm(
      `确认通过合并该 ${platformLabels.reviewShort} 吗？\n\n${platformLabels.reviewPrefix}${selectedReview.iid} ${selectedReview.title}\n${selectedReview.sourceBranch} -> ${selectedReview.targetBranch}\n策略：${strategyLabel}\n\n此操作不可撤销。`
    );
    if (!confirmed) {
      return;
    }

    const currentIndex = reviews.findIndex((item) => item.id === selectedReview.id);
    const nextReview =
      currentIndex >= 0 && currentIndex < reviews.length - 1
        ? reviews[currentIndex + 1]
        : null;

    setMergeSuccessHint(null);
    setMergeCountdown(null);
    setMergeQueuedReviewId(null);
    setMergeSubmitted(false);
    setNextReviewAfterCountdown(nextReview);

    try {
      await merge(selectedRepo.id, selectedReview.iid, {
        strategy: mergeStrategy,
        shouldRemoveSourceBranch: false,
        squash: false,
      });

      actions.selectReview(selectedReview);
      setMergeQueuedReviewId(selectedReview.id);
      setMergeSubmitted(true);
      setMergeCountdown(5);
      void fetchReviews();
    } catch {
      // 错误状态由 Hook 管理并在界面显示
    }
  };

  useEffect(() => {
    if (mergeCountdown === null) {
      return;
    }

    if (mergeCountdown <= 0) {
      if (nextReviewAfterCountdown) {
        actions.selectReview(nextReviewAfterCountdown);
        setMergeSuccessHint(null);
      } else {
        setMergeSuccessHint("当前列表已处理完成");
      }

      setMergeCountdown(null);
      setMergeQueuedReviewId(null);
      setNextReviewAfterCountdown(null);
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
  }, [actions, mergeCountdown, nextReviewAfterCountdown]);

  useEffect(() => {
    if (mergeCountdown === null || mergeQueuedReviewId === null) {
      return;
    }

    if (selectedReview?.id !== mergeQueuedReviewId) {
      setMergeCountdown(null);
      setMergeQueuedReviewId(null);
      setNextReviewAfterCountdown(null);
      setMergeSuccessHint(null);
      setMergeSubmitted(false);
    }
  }, [mergeCountdown, mergeQueuedReviewId, selectedReview?.id]);

  useEffect(() => {
    if (previousSelectedReviewIdRef.current === selectedReviewId) {
      return;
    }
    previousSelectedReviewIdRef.current = selectedReviewId;

    setFileReviewMode("single");
    resetBatchReview();
    clearAllResults();
    setMergeCountdown(null);
    setMergeQueuedReviewId(null);
    setNextReviewAfterCountdown(null);
    setMergeSubmitted(false);
    setMergeSuccessHint(null);
    resetMergeAction();
  }, [selectedReviewId, resetBatchReview, clearAllResults, resetMergeAction]);

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
            {noSelectedReview && (
              <div className="ai-review-top-tip">请先选择一个 {platformLabels.reviewShort}</div>
            )}
            <div
              className={`ai-review-panel file-review-mode-card ${
                noSelectedReview ? "panel-disabled" : ""
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
                  disabled={noSelectedReview}
                >
                  单文件评审
                </button>
                <button
                  className={`file-review-mode-btn ${
                    fileReviewMode === "batch" ? "active" : ""
                  }`}
                  onClick={() => setFileReviewMode("batch")}
                  disabled={noSelectedReview}
                >
                  {platformLabels.reviewShort} 批量评审
                </button>
              </div>
            </div>

            {fileReviewMode === "single" ? (
              <div
                className={`ai-review-panel file-review-card ${
                  noSelectedReview || noSelectedFile ? "panel-disabled" : ""
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
                {!noSelectedReview && !selectedFileDiff && (
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
                  noSelectedReview ? "panel-disabled" : ""
                }`}
              >
                <div className="ai-review-header">
                  <ListChecks size={16} />
                  <span className="file-name">当前 {platformLabels.reviewShort} 共 {reviewChanges.length} 个文件</span>
                </div>
                <div className="batch-review-progress">
                  <div className="batch-review-progress-header">
                    <span>进度</span>
                    <span>
                      {batchFinishedCount}/{batchState.total || reviewChanges.length}
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
                noSelectedReview ? "panel-disabled" : ""
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
                    disabled={noSelectedReview || mergeLoading || mergeCountdown !== null}
                  />
                  <span>立即合并</span>
                </label>
                <label className="merge-strategy-radio-item">
                  <input
                    type="radio"
                    name="merge-strategy"
                    checked={mergeStrategy === "pipeline"}
                    onChange={() => setMergeStrategy("pipeline")}
                    disabled={noSelectedReview || mergeLoading || mergeCountdown !== null}
                  />
                  <span>流水线后自动合并</span>
                </label>
              </div>
              <button
                className="btn btn-primary file-review-btn merge-approve-btn"
                onClick={handleApproveMerge}
                disabled={
                  !canApproveMerge ||
                  mergeLoading ||
                  mergeCountdown !== null ||
                  mergeSubmitted
                }
              >
                {mergeLoading ? (
                  <>
                    <span className="spinner-small" />
                    提交中...
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
                  {mergeCountdown}s 后自动跳转到下一个 {platformLabels.reviewShort}
                </div>
              )}
              {mergeError && <div className="file-review-error">{mergeError}</div>}
              {mergeSuccessHint && (
                <div className="merge-completion-hint">{mergeSuccessHint}</div>
              )}
              {selectedReview && selectedReview.state !== "open" && (
                <div className="file-review-hint">
                  当前 {platformLabels.reviewShort} 状态为 {selectedReview.state}，不可执行通过合并
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
              <label>{platformLabels.name}</label>
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
    </aside>
  );
}
