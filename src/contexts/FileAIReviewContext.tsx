/**
 * 文件级 AI 审查 Context
 * 提供跨组件共享的文件审查状态
 */

import { createContext, type ReactNode } from "react";
import {
  useFileAIReview,
  type BatchReviewState,
  type FileReviewState,
  type FilesReviewState,
} from "../hooks/useFileAIReview";
import type { AIConfig } from "../types/gitlab";
import type { PlatformDiff } from "../types/platform";

/** Context 类型 */
export interface FileAIReviewContextType {
  /** 所有文件的审查状态映射 */
  filesState: FilesReviewState;
  /** 批量审查状态 */
  batchState: BatchReviewState;
  /** 获取单个文件的审查状态 */
  getFileState: (filePath: string) => FileReviewState;
  /** 执行单个文件的代码审查 */
  reviewFile: (
    diff: string,
    filePath: string,
    aiConfig: AIConfig
  ) => Promise<boolean>;
  /** 执行当前 PR 的逐文件批量审查 */
  reviewAllFiles: (changes: PlatformDiff[], aiConfig: AIConfig) => Promise<void>;
  /** 停止批量审查（当前文件结束后生效） */
  stopBatchReview: () => void;
  /** 重置批量审查状态 */
  resetBatchReview: () => void;
  /** 清除指定文件的审查结果 */
  clearFileResult: (filePath: string) => void;
  /** 清除所有文件的审查结果 */
  clearAllResults: () => void;
}

/** 创建 Context */
export const FileAIReviewContext = createContext<FileAIReviewContextType | null>(null);

/** Provider 组件 */
export function FileAIReviewProvider({ children }: { children: ReactNode }) {
  const {
    filesState,
    batchState,
    getFileState,
    reviewFile,
    reviewAllFiles,
    stopBatchReview,
    resetBatchReview,
    clearFileResult,
    clearAllResults,
  } = useFileAIReview();

  const value: FileAIReviewContextType = {
    filesState,
    batchState,
    getFileState,
    reviewFile,
    reviewAllFiles,
    stopBatchReview,
    resetBatchReview,
    clearFileResult,
    clearAllResults,
  };

  return (
    <FileAIReviewContext.Provider value={value}>
      {children}
    </FileAIReviewContext.Provider>
  );
}
