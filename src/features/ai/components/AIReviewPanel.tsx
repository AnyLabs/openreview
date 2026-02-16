/**
 * AI 审查面板组件
 * 显示 AI 代码审查结果
 */

import { Bot, AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import type { AIReviewResult, AIReviewComment } from "../../../services/ai";

interface AIReviewPanelProps {
  /** 审查结果 */
  result: AIReviewResult | null;
  /** 是否加载中 */
  loading?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 开始审查 */
  onReview?: () => void;
}

// 移除 emoji 的辅助函数
const removeEmoji = (text: string): string => {
  return text.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu,
    ""
  );
};

/**
 * 评论项组件
 */
function CommentItem({ comment }: { comment: AIReviewComment }) {
  const getSeverityIcon = () => {
    switch (comment.severity) {
      case "error":
        return (
          <AlertCircle
            size={14}
            className="text-error"
          />
        );
      case "warning":
        return (
          <AlertTriangle
            size={14}
            className="text-warning"
          />
        );
      default:
        return (
          <Info
            size={14}
            className="text-info"
          />
        );
    }
  };

  const getSeverityClass = () => {
    switch (comment.severity) {
      case "error":
        return "review-comment-error";
      case "warning":
        return "review-comment-warning";
      default:
        return "review-comment-info";
    }
  };

  return (
    <div className={`review-comment ${getSeverityClass()}`}>
      <div className="review-comment-header">
        {getSeverityIcon()}
        <span className="review-comment-line">行 {comment.line}</span>
      </div>
      <div className="review-comment-content">
        {removeEmoji(comment.content)}
      </div>
    </div>
  );
}

/**
 * AI 审查面板
 */
export function AIReviewPanel({
  result,
  loading = false,
  error = null,
  onReview,
}: AIReviewPanelProps) {
  // 加载中状态
  if (loading) {
    return (
      <div className="ai-review-panel">
        <div className="ai-review-header">
          <Bot size={16} />
          <span>AI 代码审查</span>
        </div>
        <div className="ai-review-loading">
          <Loader2
            className="spin"
            size={24}
          />
          <p>正在分析代码...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="ai-review-panel">
        <div className="ai-review-header">
          <Bot size={16} />
          <span>AI 代码审查</span>
        </div>
        <div className="ai-review-error">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // 无结果状态 - 不显示任何内容
  if (!result) {
    return null;
  }

  // 有结果状态
  return (
    <div className="ai-review-panel">
      <div className="ai-review-header">
        <Bot size={16} />
        <span>AI 代码审查</span>
        <span className="ai-review-count">{result.comments.length} 条评论</span>
      </div>

      {/* 总结 */}
      <div className="ai-review-summary">
        <h4>总结</h4>
        <p>{removeEmoji(result.summary)}</p>
        {result.duration && (
          <div
            className="ai-review-duration"
            style={{
              marginTop: "8px",
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            评审运行耗时：{(result.duration / 1000).toFixed(2)} s
          </div>
        )}
      </div>

      {/* 评论列表 */}
      {result.comments.length > 0 && (
        <div className="ai-review-comments">
          <h4>详细评论</h4>
          {result.comments.map((comment, index) => (
            <CommentItem
              key={index}
              comment={comment}
            />
          ))}
        </div>
      )}

      {/* 重新审查按钮 */}
      {onReview && (
        <div className="ai-review-actions">
          <button
            className="btn btn-secondary"
            onClick={onReview}
          >
            重新审查
          </button>
        </div>
      )}
    </div>
  );
}
