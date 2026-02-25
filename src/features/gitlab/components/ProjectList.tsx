/**
 * 仓库/项目列表组件
 */

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";
import type { PlatformRepo } from "../../../types/platform";
import { getPlatformLabels } from "../../../constants/platform-labels";

interface RepoListProps {
  repos: PlatformRepo[];
  loading: boolean;
  error: string | null;
  onSelect?: () => void;
}

export function ProjectList({
  repos,
  loading,
  error,
  onSelect,
}: RepoListProps) {
  const [state, actions] = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  // 获取当前平台的文案
  const platformLabels = getPlatformLabels(state.activePlatform);

  // 过滤仓库
  const filteredRepos = searchQuery.trim()
    ? repos.filter((repo) =>
        repo.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : repos;

  // GitLab 需要先选择组织，GitHub 可以直接显示个人仓库
  if (!state.selectedOrg && state.activePlatform === "gitlab") {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-hint">请先选择{platformLabels.org}</div>
      </div>
    );
  }

  // 加载中
  if (loading) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-loading">
          <Loader2
            size={14}
            className="spin"
          />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="sidebar-section-body">
      {/* 搜索输入框 */}
      <div className="panel-search-box">
        <Search
          size={12}
          className="panel-search-icon"
        />
        <input
          type="text"
          placeholder="搜索仓库..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-search-input"
        />
      </div>
      {filteredRepos.length === 0 ? (
        <div className="list-item-hint">
          {searchQuery.trim() ? "无匹配仓库" : "该组织暂无仓库"}
        </div>
      ) : (
        filteredRepos.map((repo) => (
          <div
            key={repo.id}
            className={`list-item ${
              state.selectedRepo?.id === repo.id ? "active" : ""
            }`}
            onClick={() => {
              actions.selectRepo(repo);
              onSelect?.();
            }}
          >
            <span className="list-item-text">{repo.name}</span>
          </div>
        ))
      )}
    </div>
  );
}
