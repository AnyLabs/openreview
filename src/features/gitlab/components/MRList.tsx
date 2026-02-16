/**
 * MR 列表组件
 */

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";

interface MRListProps {
  mergeRequests: any[];
  loading: boolean;
  error: string | null;
  onSelect?: () => void;
}

export function MRList({
  mergeRequests,
  loading,
  error,
  onSelect,
}: MRListProps) {
  const [state, actions] = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  // 过滤 MR
  const filteredMRs = searchQuery.trim()
    ? mergeRequests.filter(
        (mr) =>
          mr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          String(mr.iid).includes(searchQuery)
      )
    : mergeRequests;

  // 未选择项目
  if (!state.selectedProject) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-hint">请先选择项目</div>
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

  /** 获取 MR 状态样式类 */
  const getStatusClass = (mrState: string) => {
    switch (mrState) {
      case "opened":
        return "open";
      case "merged":
        return "merged";
      case "closed":
        return "closed";
      default:
        return "";
    }
  };

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
          placeholder="搜索 MR..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-search-input"
        />
      </div>
      {filteredMRs.length === 0 ? (
        <div className="list-item-hint">
          {searchQuery.trim() ? "无匹配 MR" : "暂无 MR"}
        </div>
      ) : (
        filteredMRs.map((mr) => (
          <div
            key={mr.id}
            className={`list-item ${
              state.selectedMR?.id === mr.id ? "active" : ""
            }`}
            onClick={() => {
              actions.selectMR(mr);
              onSelect?.();
            }}
            title={mr.title}
          >
            <span className={`mr-status ${getStatusClass(mr.state)}`} />
            <span className="list-item-text">
              !{mr.iid} {mr.title}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
