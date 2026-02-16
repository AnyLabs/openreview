/**
 * 文件级 AI 审查 Context Hook
 * 提供对 FileAIReviewContext 的访问
 */

import { useContext } from "react";
import { FileAIReviewContext } from "../contexts/FileAIReviewContext";
import type { FileAIReviewContextType } from "../contexts/FileAIReviewContext";

/**
 * 使用文件 AI 审查状态的 Hook
 * 必须在 FileAIReviewProvider 内部使用
 */
export function useFileAIReviewContext(): FileAIReviewContextType {
  const context = useContext(FileAIReviewContext);
  if (!context) {
    throw new Error(
      "useFileAIReviewContext must be used within a FileAIReviewProvider"
    );
  }
  return context;
}
