/**
 * 项目列表组件
 */

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";

interface ProjectListProps {
  projects: any[];
  loading: boolean;
  error: string | null;
  onSelect?: () => void;
}

export function ProjectList({
  projects,
  loading,
  error,
  onSelect,
}: ProjectListProps) {
  const [state, actions] = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  // 过滤项目
  const filteredProjects = searchQuery.trim()
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  // 未选择群组
  if (!state.selectedGroup) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-hint">请先选择群组</div>
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
          placeholder="搜索项目..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-search-input"
        />
      </div>
      {filteredProjects.length === 0 ? (
        <div className="list-item-hint">
          {searchQuery.trim() ? "无匹配项目" : "该群组暂无项目"}
        </div>
      ) : (
        filteredProjects.map((project) => (
          <div
            key={project.id}
            className={`list-item ${
              state.selectedProject?.id === project.id ? "active" : ""
            }`}
            onClick={() => {
              actions.selectProject(project);
              onSelect?.();
            }}
          >
            <span className="list-item-text">{project.name}</span>
          </div>
        ))
      )}
    </div>
  );
}
