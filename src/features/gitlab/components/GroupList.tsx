/**
 * 群组列表组件
 */

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";

interface GroupListProps {
  groups: any[];
  loading: boolean;
  error: string | null;
  onSelect?: () => void;
}

export function GroupList({
  groups,
  loading,
  error,
  onSelect,
}: GroupListProps) {
  const [state, actions] = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  // 过滤群组
  const filteredGroups = searchQuery.trim()
    ? groups.filter((group) =>
        group.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : groups;

  // 未连接时显示提示
  if (!state.isConnected) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-hint">请先配置 GitLab 连接</div>
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
          placeholder="搜索群组..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-search-input"
        />
      </div>
      {filteredGroups.length === 0 ? (
        <div className="list-item-hint">
          {searchQuery.trim() ? "无匹配群组" : "暂无群组"}
        </div>
      ) : (
        filteredGroups.map((group) => (
          <div
            key={group.id}
            className={`list-item ${
              state.selectedGroup?.id === group.id ? "active" : ""
            }`}
            onClick={() => {
              actions.selectGroup(group);
              onSelect?.();
            }}
          >
            <span className="list-item-text">{group.name}</span>
          </div>
        ))
      )}
    </div>
  );
}
