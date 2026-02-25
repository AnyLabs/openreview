import { useState, useCallback, useEffect } from "react";
import { Folder, GitBranch, GitPullRequest, Settings, Bot } from "lucide-react";
import { CollapsiblePanel } from "../../../components/ui/CollapsiblePanel";
import { GroupTreeList } from "../../gitlab/components/GroupTreeList";
import { ProjectList } from "../../gitlab/components/ProjectList";
import { ReviewList } from "../../gitlab/components/ReviewList";
import { SettingsModal } from "../../settings/components/SettingsModal";
import { AIProviderModal } from "../../settings/components/AIProviderModal";
import { useApp } from "../../../contexts/AppContext";
import {
  useOrgs,
  useRepos,
  useReviews,
} from "../../../hooks/usePlatform";
import { getPlatformLabels } from "../../../constants/platform-labels";

export function Sidebar() {
  const [state] = useApp();
  const {
    orgs,
    loading: orgsLoading,
    error: orgsError,
    fetchOrgs,
  } = useOrgs();
  const {
    repos,
    loading: reposLoading,
    error: reposError,
  } = useRepos(
    // GitLab 必须选择组织，GitHub 可以不选组织显示个人仓库
    state.activePlatform === "github" ? undefined : state.selectedOrg?.id
  );
  const {
    reviews,
    loading: reviewsLoading,
    error: reviewsError,
  } = useReviews(state.selectedRepo?.id);

  // 获取当前平台的文案
  const platformLabels = getPlatformLabels(state.activePlatform);

  // 设置弹窗状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIProviderModalOpen, setIsAIProviderModalOpen] = useState(false);

  // 连接成功后加载组织，平台切换时也刷新组织
  useEffect(() => {
    if (state.isConnected) {
      fetchOrgs();
    }
  }, [state.isConnected, state.activePlatform, fetchOrgs]);

  // 面板展开状态
  const [panelStates, setPanelStates] = useState({
    orgs: true,
    repos: false,
    reviews: false,
  });

  // 切换面板展开状态
  const handleToggle = useCallback((panel: keyof typeof panelStates) => {
    return (expanded: boolean) => {
      setPanelStates((prev) => ({ ...prev, [panel]: expanded }));
    };
  }, []);

  // 选中组织后：收起组织面板，展开仓库面板
  const handleOrgSelect = useCallback(() => {
    setPanelStates({ orgs: false, repos: true, reviews: false });
  }, []);

  // 选中仓库后：收起仓库面板，展开 Review 面板
  const handleRepoSelect = useCallback(() => {
    setPanelStates({ orgs: false, repos: false, reviews: true });
  }, []);

  // 选中 Review 后：保持 Review 面板展开（不自动收起）
  const handleReviewSelect = useCallback(() => {
    // 不执行任何操作，保持面板状态不变
  }, []);

  // 打开设置弹窗
  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  // 关闭设置弹窗
  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  const handleOpenAIProviderModal = () => {
    setIsAIProviderModalOpen(true);
  };

  const handleCloseAIProviderModal = () => {
    setIsAIProviderModalOpen(false);
  };

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-body">
          {/* 组织面板 */}
          <CollapsiblePanel
            title={platformLabels.org}
            icon={<Folder size={14} />}
            defaultExpanded={panelStates.orgs}
            badge={orgs.length > 0 ? <span>{orgs.length}</span> : undefined}
            onToggle={handleToggle("orgs")}
          >
            <GroupTreeList
              orgs={orgs}
              loading={orgsLoading}
              error={orgsError}
              onSelect={handleOrgSelect}
            />
          </CollapsiblePanel>

          {/* 仓库面板 */}
          <CollapsiblePanel
            title={platformLabels.repo}
            icon={<GitBranch size={14} />}
            defaultExpanded={panelStates.repos}
            badge={
              repos.length > 0 ? <span>{repos.length}</span> : undefined
            }
            onToggle={handleToggle("repos")}
          >
            <ProjectList
              repos={repos}
              loading={reposLoading}
              error={reposError}
              onSelect={handleRepoSelect}
            />
          </CollapsiblePanel>

          {/* Review 面板 */}
          <CollapsiblePanel
            title={platformLabels.review}
            icon={<GitPullRequest size={14} />}
            defaultExpanded={panelStates.reviews}
            badge={
              reviews.length > 0 ? (
                <span>{reviews.length}</span>
              ) : undefined
            }
            onToggle={handleToggle("reviews")}
          >
            <ReviewList
              reviews={reviews}
              loading={reviewsLoading}
              error={reviewsError}
              onSelect={handleReviewSelect}
            />
          </CollapsiblePanel>
        </div>

        {/* 侧边栏底部 - 设置入口 */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-settings-btn"
            onClick={handleOpenAIProviderModal}
            title="打开AI模型配置"
          >
            <Bot size={16} />
            <span>AI模型配置</span>
          </button>
          <button
            type="button"
            className="sidebar-settings-btn"
            onClick={handleOpenSettings}
            title="打开系统设置"
          >
            <Settings size={16} />
            <span>设置</span>
          </button>
        </div>
      </aside>

      {/* 设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
      />
      <AIProviderModal
        isOpen={isAIProviderModalOpen}
        onClose={handleCloseAIProviderModal}
      />
    </>
  );
}
