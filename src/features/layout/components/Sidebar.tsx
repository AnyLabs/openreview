import { useState, useCallback, useEffect } from "react";
import {
  Folder,
  GitBranch,
  GitPullRequest,
  Settings,
  Bot,
  RefreshCw,
} from "lucide-react";
import { CollapsiblePanel } from "../../../components/ui/CollapsiblePanel";
import { GroupTreeList as GroupList } from "../../gitlab/components/GroupTreeList";
import { ProjectList } from "../../gitlab/components/ProjectList";
import { MRList } from "../../gitlab/components/MRList";
import { SettingsModal } from "../../settings/components/SettingsModal";
import { AIProviderModal } from "../../settings/components/AIProviderModal";
import { useApp } from "../../../contexts/AppContext";
import {
  useGroups,
  useProjects,
  useMergeRequests,
} from "../../../hooks/useGitLab";

const STORAGE_PANEL_STATES = "sidebar-panel-states";

export function Sidebar() {
  const [state] = useApp();
  const {
    groups,
    loading: groupsLoading,
    error: groupsError,
    fetchGroups,
  } = useGroups();
  const {
    projects,
    loading: projectsLoading,
    error: projectsError,
    fetchProjects,
  } = useProjects(state.selectedGroup?.id);
  const {
    mergeRequests,
    loading: mrsLoading,
    error: mrsError,
    fetchMergeRequests,
  } = useMergeRequests(state.selectedProject?.id);

  // 设置弹窗状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAIProviderModalOpen, setIsAIProviderModalOpen] = useState(false);

  // 从 localStorage 加载面板状态
  const loadPanelStates = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PANEL_STATES);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn("Failed to load panel states from localStorage:", error);
    }
    return { groups: true, projects: false, mrs: false };
  }, []);

  // 保存面板状态到 localStorage
  const savePanelStates = useCallback((states: typeof panelStates) => {
    try {
      localStorage.setItem(STORAGE_PANEL_STATES, JSON.stringify(states));
    } catch (error) {
      console.warn("Failed to save panel states to localStorage:", error);
    }
  }, []);

  // 面板展开状态
  const [panelStates, setPanelStates] = useState(loadPanelStates);

  // 连接成功后加载群组
  useEffect(() => {
    if (state.isConnected) {
      fetchGroups();
    }
  }, [state.isConnected, fetchGroups]);

  // 当面板状态改变时保存到 localStorage
  useEffect(() => {
    savePanelStates(panelStates);
  }, [panelStates, savePanelStates]);

  // 切换面板展开状态
  const handleToggle = useCallback((panel: keyof typeof panelStates) => {
    return (expanded: boolean) => {
      setPanelStates((prev: typeof panelStates) => ({ ...prev, [panel]: expanded }));
    };
  }, []);

  // 选中群组后：收起群组面板，展开项目面板
  const handleGroupSelect = useCallback(() => {
    setPanelStates({ groups: false, projects: true, mrs: false });
  }, []);

  // 选中项目后：收起项目面板，展开 MR 面板
  const handleProjectSelect = useCallback(() => {
    setPanelStates({ groups: false, projects: false, mrs: true });
  }, []);

  // 选中 MR 后：保持 MR 面板展开（不自动收起）
  const handleMRSelect = useCallback(() => {
    // 不执行任何操作，保持面板状态不变
  }, []);

  /** 渲染标题栏刷新按钮 */
  const renderRefreshAction = useCallback(
    (
      label: string,
      loading: boolean,
      disabled: boolean,
      onRefresh: () => void
    ) => (
      <button
        type="button"
        className={`collapsible-panel-action-btn ${
          loading ? "is-loading" : ""
        }`}
        onClick={onRefresh}
        disabled={disabled || loading}
        aria-label={label}
        title={label}
      >
        <RefreshCw size={14} />
      </button>
    ),
    []
  );

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
          {/* 群组面板 */}
          <CollapsiblePanel
            title="群组"
            icon={<Folder size={14} />}
            defaultExpanded={panelStates.groups}
            badge={groups.length > 0 ? <span>{groups.length}</span> : undefined}
            actions={renderRefreshAction(
              "刷新群组列表",
              groupsLoading,
              !state.isConnected,
              fetchGroups
            )}
            onToggle={handleToggle("groups")}
          >
            <GroupList
              groups={groups}
              loading={groupsLoading}
              error={groupsError}
              onSelect={handleGroupSelect}
            />
          </CollapsiblePanel>

          {/* 项目面板 */}
          <CollapsiblePanel
            title="项目"
            icon={<GitBranch size={14} />}
            defaultExpanded={panelStates.projects}
            badge={
              projects.length > 0 ? <span>{projects.length}</span> : undefined
            }
            actions={renderRefreshAction(
              "按当前群组刷新项目列表",
              projectsLoading,
              !state.isConnected || !state.selectedGroup,
              fetchProjects
            )}
            onToggle={handleToggle("projects")}
          >
            <ProjectList
              projects={projects}
              loading={projectsLoading}
              error={projectsError}
              onSelect={handleProjectSelect}
            />
          </CollapsiblePanel>

          {/* MR面板 */}
          <CollapsiblePanel
            title="合并请求"
            icon={<GitPullRequest size={14} />}
            defaultExpanded={panelStates.mrs}
            badge={
              mergeRequests.length > 0 ? (
                <span>{mergeRequests.length}</span>
              ) : undefined
            }
            actions={renderRefreshAction(
              "按当前项目刷新合并请求列表",
              mrsLoading,
              !state.isConnected || !state.selectedProject,
              fetchMergeRequests
            )}
            onToggle={handleToggle("mrs")}
          >
            <MRList
              mergeRequests={mergeRequests}
              loading={mrsLoading}
              error={mrsError}
              onSelect={handleMRSelect}
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
