import { FileCode2, Loader2, AlertCircle } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";
import { useReviewChanges } from "../../../hooks/usePlatform";
import { DiffViewer } from "../../diff/components/DiffViewer";
import type { PlatformDiff } from "../../../types/platform";
import { getPlatformLabels } from "../../../constants/platform-labels";

/**
 * 主内容区域组件 - 显示 Diff 视图
 */
export function MainContent() {
  const [state, actions] = useApp();
  const { selectedRepo, selectedReview, selectedFileIndex } = state;

  // 获取 Review 变更
  const { reviewWithChanges, loading, error } = useReviewChanges(
    selectedRepo?.id,
    selectedReview?.iid
  );

  // 获取当前平台的文案
  const platformLabels = state.activePlatform
    ? getPlatformLabels(state.activePlatform)
    : getPlatformLabels("gitlab");

  // 处理文件选择
  const handleFileSelect = (index: number, diff: PlatformDiff) => {
    actions.selectFile(index, diff);
  };

  // 未选择 Review
  if (!selectedReview) {
    return (
      <>
        <header className="main-header">
          <h2 style={{ fontSize: "15px", fontWeight: 600 }}>
            变更文件
          </h2>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            选择一个 {platformLabels.review} 查看详情
          </span>
        </header>

        <div className="main-body">
          <div className="empty-state">
            <FileCode2
              className="empty-state-icon"
              size={48}
            />
            <h3 className="empty-state-title">暂无变更</h3>
            <p className="empty-state-description">
              从左侧选择一个 {platformLabels.review} 以查看代码变更
            </p>
          </div>
        </div>
      </>
    );
  }

  // 加载中
  if (loading) {
    return (
      <>
        <header className="main-header">
          <h2 style={{ fontSize: "15px", fontWeight: 600 }}>
            {platformLabels.reviewPrefix}{selectedReview.iid} {selectedReview.title}
          </h2>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            {selectedReview.sourceBranch} → {selectedReview.targetBranch}
          </span>
        </header>

        <div className="main-body">
          <div className="loading-state">
            <Loader2
              className="spin"
              size={32}
            />
            <p>加载变更中...</p>
          </div>
        </div>
      </>
    );
  }

  // 错误
  if (error) {
    return (
      <>
        <header className="main-header">
          <h2 style={{ fontSize: "15px", fontWeight: 600 }}>
            {platformLabels.reviewPrefix}{selectedReview.iid} {selectedReview.title}
          </h2>
        </header>

        <div className="main-body">
          <div className="error-state">
            <AlertCircle size={32} />
            <p>{error}</p>
          </div>
        </div>
      </>
    );
  }

  // 显示 Diff
  return (
    <>
      <header className="main-header">
        <h2 style={{ fontSize: "15px", fontWeight: 600 }}>
          {platformLabels.reviewPrefix}{selectedReview.iid} {selectedReview.title}
        </h2>
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          {selectedReview.sourceBranch} → {selectedReview.targetBranch}
          {reviewWithChanges && ` · ${reviewWithChanges.changes.length} 个文件`}
        </span>
      </header>

      <div className="main-body">
        {reviewWithChanges && reviewWithChanges.changes.length > 0 ? (
          <DiffViewer
            diffs={reviewWithChanges.changes}
            selectedFileIndex={selectedFileIndex}
            onFileSelect={handleFileSelect}
            repoId={selectedRepo?.id}
            reviewIid={selectedReview?.iid}
            diffRefs={reviewWithChanges.diffRefs}
          />
        ) : (
          <div className="empty-state">
            <FileCode2
              className="empty-state-icon"
              size={48}
            />
            <h3 className="empty-state-title">没有变更</h3>
            <p className="empty-state-description">
              此 {platformLabels.review} 没有代码变更
            </p>
          </div>
        )}
      </div>
    </>
  );
}
