import { FileCode2, Loader2, AlertCircle } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";
import { useMergeRequestChanges } from "../../../hooks/useGitLab";
import { DiffViewer } from "../../diff/components/DiffViewer";
import type { GitLabDiff } from "../../../types/gitlab";

/**
 * 主内容区域组件 - 显示 Diff 视图
 */
export function MainContent() {
  const [state, actions] = useApp();
  const { selectedProject, selectedMR, selectedFileIndex } = state;

  // 获取 MR 变更
  const { mrWithChanges, loading, error } = useMergeRequestChanges(
    selectedProject?.id,
    selectedMR?.iid
  );

  // 处理文件选择
  const handleFileSelect = (index: number, diff: GitLabDiff) => {
    actions.selectFile(index, diff);
  };

  // 未选择 MR
  if (!selectedMR) {
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
            选择一个 MR 查看详情
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
              从左侧选择一个 Merge Request 以查看代码变更
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
            !{selectedMR.iid} {selectedMR.title}
          </h2>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            {selectedMR.source_branch} → {selectedMR.target_branch}
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
            !{selectedMR.iid} {selectedMR.title}
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
          !{selectedMR.iid} {selectedMR.title}
        </h2>
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          {selectedMR.source_branch} → {selectedMR.target_branch}
          {mrWithChanges && ` · ${mrWithChanges.changes.length} 个文件`}
        </span>
      </header>

      <div className="main-body">
        {mrWithChanges && mrWithChanges.changes.length > 0 ? (
          <DiffViewer
            diffs={mrWithChanges.changes}
            selectedFileIndex={selectedFileIndex}
            onFileSelect={handleFileSelect}
            projectId={selectedProject?.id}
            mrIid={selectedMR?.iid}
            diffRefs={mrWithChanges.diff_refs}
          />
        ) : (
          <div className="empty-state">
            <FileCode2
              className="empty-state-icon"
              size={48}
            />
            <h3 className="empty-state-title">没有变更</h3>
            <p className="empty-state-description">
              此 Merge Request 没有代码变更
            </p>
          </div>
        )}
      </div>
    </>
  );
}
