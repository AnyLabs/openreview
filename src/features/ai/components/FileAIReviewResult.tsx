/**
 * 文件级 AI 审查结果组件
 * 显示 AI 代码审查结果和提交表单
 */

import { useState, useCallback, useEffect } from "react";
import { Bot, AlertCircle, Loader2, Send, CheckCircle } from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import type { AIReviewResult } from "../../../services/ai";
import type { GitLabFileLineLatestCommitters } from "../../../services/gitlab";
import type { GitLabDiscussionThreadView } from "../../diff/types/gitlabComments";

interface FileAIReviewResultProps {
  /** 文件路径 */
  filePath: string;
  /** 审查结果 */
  result: AIReviewResult | null;
  /** 是否加载中 */
  loading?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 项目 ID */
  projectId?: number;
  /** MR IID */
  mrIid?: number;
  /** 提交评论回调 */
  onSubmitComment?: (content: string) => Promise<void>;
  /** 当前文件的 GitLab 文件级讨论 */
  gitlabFileDiscussions?: GitLabDiscussionThreadView[];
  /** 当前文件的 GitLab 评论总数（文件级+行级） */
  gitlabCommentCount?: number;
  /** 当前文件每个变更行对应的最新提交者 */
  lineLatestCommitters?: GitLabFileLineLatestCommitters;
}

/**
 * 文件级 AI 审查结果组件
 */
export function FileAIReviewResult({
  filePath: _filePath,
  result,
  loading = false,
  error = null,
  projectId: _projectId,
  mrIid: _mrIid,
  onSubmitComment,
  gitlabFileDiscussions = [],
  gitlabCommentCount = 0,
  lineLatestCommitters,
}: FileAIReviewResultProps) {
  const [commentContent, setCommentContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const headerCommentCount =
    gitlabCommentCount > 0 ? gitlabCommentCount : result?.comments.length || 0;
  const headerCommentLabel = gitlabCommentCount > 0 ? "GitLab 评论" : "AI 评论";

  // 移除 emoji 的辅助函数
  const removeEmoji = useCallback((text: string): string => {
    return text.replace(
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu,
      ""
    );
  }, []);

  const getLineCommitterMention = useCallback(
    (lineNumber: number): string => {
      if (!lineLatestCommitters || !Number.isFinite(lineNumber) || lineNumber <= 0) {
        return "";
      }
      const authorInfo =
        lineLatestCommitters.additions[lineNumber] ||
        lineLatestCommitters.deletions[lineNumber];
      const authorName = authorInfo?.authorName?.trim();
      return authorName ? ` @${authorName}` : "";
    },
    [lineLatestCommitters]
  );

  // 当 AI 审查结果变化时，自动填充编辑器内容（只包含详细评论，不包含总结）
  useEffect(() => {
    if (result) {
      // 构建评审意见内容（只包含详细评论）
      let content = "";

      // 添加详细评论
      if (result.comments && result.comments.length > 0) {
        result.comments.forEach((comment, index) => {
          const severityText =
            comment.severity === "error"
              ? "[错误]"
              : comment.severity === "warning"
              ? "[警告]"
              : "[提示]";
          const mention = getLineCommitterMention(comment.line);
          content += `${index + 1}. ${severityText} **行 ${
            comment.line
          }**: ${removeEmoji(comment.content)}${mention}\n\n`;
        });
      }

      setCommentContent(content);
    }
  }, [result, removeEmoji, getLineCommitterMention]);

  // 处理提交评论
  const handleSubmit = useCallback(async () => {
    if (!commentContent.trim() || !onSubmitComment) return;

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      await onSubmitComment(commentContent);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (e) {
      // 错误处理
    } finally {
      setIsSubmitting(false);
    }
  }, [commentContent, onSubmitComment]);

  // 加载中状态
  if (loading) {
    return (
      <div className="file-ai-review-result">
        <div className="file-ai-review-header">
          <Bot size={16} />
          <span>AI 代码审查</span>
        </div>
        <div className="file-ai-review-loading">
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
      <div className="file-ai-review-result">
        <div className="file-ai-review-header">
          <Bot size={16} />
          <span>AI 代码审查</span>
        </div>
        <div className="file-ai-review-error">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // 渲染AI审查结果（如果有）
  const renderAIReviewResult = () => {
    if (!result) return null;

    return (
      <>
        {/* 总结 */}
        <div className="file-ai-review-summary">
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
      </>
    );
  };

  const renderGitLabFileDiscussions = () => {
    if (gitlabFileDiscussions.length === 0) return null;

    return (
      <div className="gitlab-file-discussions">
        <h4>GitLab 文件评论</h4>
        <div className="gitlab-file-discussions-list">
          {gitlabFileDiscussions.map((thread) => (
            <div
              key={thread.id}
              className="gitlab-discussion-thread"
            >
              <div className="gitlab-discussion-thread-head">
                <span>讨论 #{thread.id.slice(0, 8)}</span>
                {thread.resolved && (
                  <span className="gitlab-discussion-resolved">已解决</span>
                )}
              </div>
              <div className="gitlab-discussion-notes">
                {thread.notes.map((note) => (
                  <div
                    key={note.id}
                    className="gitlab-discussion-note"
                  >
                    <div className="gitlab-discussion-note-meta">
                      <span>{note.authorName}</span>
                      <span>·</span>
                      <span>{new Date(note.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="gitlab-discussion-note-body">{note.body}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="file-ai-review-result">
      <div className="file-ai-review-header">
        <Bot size={16} />
        <span>AI 代码审查</span>
        {headerCommentCount > 0 && (
          <span className="ai-review-count">
            {headerCommentLabel} {headerCommentCount} 条
          </span>
        )}
      </div>

      {/* AI审查结果（如果有） */}
      {renderAIReviewResult()}
      {renderGitLabFileDiscussions()}

      {/* 评论提交表单 - 始终显示 */}
      {onSubmitComment && (
        <div className="file-ai-review-submit-form">
          <div className="submit-form-header">
            <h4>提交评审意见</h4>
            {submitSuccess && (
              <span className="submit-success">
                <CheckCircle size={14} />
                提交成功
              </span>
            )}
          </div>

          {/* MDEditor */}
          <div className="editor-content">
            <MDEditor
              value={commentContent}
              onChange={(value) => setCommentContent(value || "")}
              height={200}
              preview="edit"
              textareaProps={{
                placeholder: "在此输入评审意见，支持 Markdown 格式...",
              }}
            />
          </div>

          {/* 提交按钮 */}
          <div className="submit-actions">
            <button
              className="btn btn-primary submit-btn"
              onClick={handleSubmit}
              disabled={!commentContent.trim() || isSubmitting}
              type="button"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    size={14}
                    className="spin"
                  />
                  提交中...
                </>
              ) : (
                <>
                  <Send size={14} />
                  提交评论
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
