/**
 * Review（MR/PR）列表组件
 */

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";
import type { PlatformReview } from "../../../types/platform";
import { getPlatformLabels } from "../../../constants/platform-labels";

interface ReviewListProps {
  reviews: PlatformReview[];
  loading: boolean;
  error: string | null;
  onSelect?: () => void;
}

export function ReviewList({
  reviews,
  loading,
  error,
  onSelect,
}: ReviewListProps) {
  const [state, actions] = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  // 获取当前平台的文案
  const platformLabels = getPlatformLabels(state.activePlatform);

  // 过滤 Review
  const filteredReviews = searchQuery.trim()
    ? reviews.filter(
        (review) =>
          review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          String(review.iid).includes(searchQuery)
      )
    : reviews;

  // 未选择仓库
  if (!state.selectedRepo) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-hint">请先选择{platformLabels.repo}</div>
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

  /** 获取 Review 状态样式类 */
  const getStatusClass = (reviewState: string) => {
    switch (reviewState) {
      case "open":
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
          placeholder={`搜索${platformLabels.reviewShort}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-search-input"
        />
      </div>
      {filteredReviews.length === 0 ? (
        <div className="list-item-hint">
          {searchQuery.trim() ? "无匹配结果" : `暂无${platformLabels.reviewShort}`}
        </div>
      ) : (
        filteredReviews.map((review) => (
          <div
            key={review.id}
            className={`list-item ${
              state.selectedReview?.id === review.id ? "active" : ""
            }`}
            onClick={() => {
              actions.selectReview(review);
              onSelect?.();
            }}
            title={review.title}
          >
            <span className={`mr-status ${getStatusClass(review.state)}`} />
            <span className="list-item-text">
              {platformLabels.reviewPrefix}{review.iid} {review.title}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
