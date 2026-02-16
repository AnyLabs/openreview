/**
 * 文件级 AI 审查 Hook
 * 管理每个文件的 AI 代码审查状态
 * 通过 ReviewEngine 统一调用，不再感知协议细节
 */

import { useState, useCallback, useRef } from "react";
import type { AIReviewResult } from "../services/ai";
import { executeReview } from "../services/review-engine";
import type { AIConfig, GitLabDiff } from "../types/gitlab";

/** 单个文件的审查状态 */
export interface FileReviewState {
  /** 是否正在审查 */
  loading: boolean;
  /** 审查结果 */
  result: AIReviewResult | null;
  /** 错误信息 */
  error: string | null;
}

/** 所有文件的审查状态映射 */
export type FilesReviewState = Map<string, FileReviewState>;

/** 批量审查状态 */
export interface BatchReviewState {
  /** 是否正在批量审查 */
  running: boolean;
  /** 总文件数 */
  total: number;
  /** 已完成文件数 */
  completed: number;
  /** 失败文件数 */
  failed: number;
  /** 当前处理文件 */
  currentFilePath: string | null;
  /** 是否被手动停止 */
  stopped: boolean;
}

const DEFAULT_BATCH_STATE: BatchReviewState = {
  running: false,
  total: 0,
  completed: 0,
  failed: 0,
  currentFilePath: null,
  stopped: false,
};

/**
 * 文件级 AI 审查 Hook
 */
export function useFileAIReview() {
  // 使用 Map 存储每个文件的审查状态，key 为文件路径
  const [filesState, setFilesState] = useState<FilesReviewState>(new Map());
  const [batchState, setBatchState] =
    useState<BatchReviewState>(DEFAULT_BATCH_STATE);

  // 使用 ref 来存储正在进行的请求，避免重复请求
  const pendingRequests = useRef<Set<string>>(new Set());
  const batchRunId = useRef(0);
  const batchRunningRef = useRef(false);

  /**
   * 获取文件的审查状态
   */
  const getFileState = useCallback(
    (filePath: string): FileReviewState => {
      return (
        filesState.get(filePath) || {
          loading: false,
          result: null,
          error: null,
        }
      );
    },
    [filesState],
  );

  /**
   * 更新文件的审查状态
   */
  const updateFileState = useCallback(
    (filePath: string, state: Partial<FileReviewState>) => {
      setFilesState((prev) => {
        const newMap = new Map(prev);
        const currentState = newMap.get(filePath) || {
          loading: false,
          result: null,
          error: null,
        };
        newMap.set(filePath, { ...currentState, ...state });
        return newMap;
      });
    },
    [],
  );

  /**
   * 执行单个文件的代码审查
   */
  const reviewFile = useCallback(
    async (
      diff: string,
      filePath: string,
      aiConfig: AIConfig,
    ): Promise<boolean> => {
      // 检查是否已有正在进行的请求
      if (pendingRequests.current.has(filePath)) {
        return false;
      }

      // 标记请求开始
      pendingRequests.current.add(filePath);

      // 设置加载状态
      updateFileState(filePath, {
        loading: true,
        error: null,
        result: null,
      });

      const startTime = Date.now();

      try {
        const reviewResult = await executeReview(aiConfig, diff);

        // 计算耗时
        const duration = Date.now() - startTime;
        const resultWithDuration = { ...reviewResult, duration };

        // 更新结果
        updateFileState(filePath, {
          result: resultWithDuration,
          loading: false,
          error: null,
        });
        return true;
      } catch (e) {
        updateFileState(filePath, {
          error: e instanceof Error ? e.message : "审查失败",
          loading: false,
          result: null,
        });
        return false;
      } finally {
        // 移除请求标记
        pendingRequests.current.delete(filePath);
      }
    },
    [updateFileState],
  );

  /**
   * 逐个文件执行批量审查
   */
  const reviewAllFiles = useCallback(
    async (changes: GitLabDiff[], aiConfig: AIConfig) => {
      if (batchRunningRef.current) {
        return;
      }

      const reviewQueue = changes
        .map((change) => {
          const filePath = change.new_path || change.old_path || "";
          if (!filePath) return null;
          return {
            filePath,
            diffContent: `--- a/${change.old_path}\n+++ b/${change.new_path}\n${
              change.diff || ""
            }`,
          };
        })
        .filter(
          (item): item is { filePath: string; diffContent: string } =>
            item !== null,
        );

      batchRunId.current += 1;
      const currentRunId = batchRunId.current;
      batchRunningRef.current = true;

      let completed = 0;
      let failed = 0;

      setBatchState({
        running: true,
        total: reviewQueue.length,
        completed: 0,
        failed: 0,
        currentFilePath: null,
        stopped: false,
      });

      for (const item of reviewQueue) {
        if (batchRunId.current !== currentRunId) {
          batchRunningRef.current = false;
          setBatchState((prev) => ({
            ...prev,
            running: false,
            currentFilePath: null,
            stopped: true,
          }));
          return;
        }

        setBatchState((prev) => ({
          ...prev,
          currentFilePath: item.filePath,
        }));

        const success = await reviewFile(
          item.diffContent,
          item.filePath,
          aiConfig,
        );
        if (success) {
          completed += 1;
        } else {
          failed += 1;
        }

        setBatchState((prev) => ({
          ...prev,
          completed,
          failed,
        }));
      }

      batchRunningRef.current = false;
      setBatchState((prev) => ({
        ...prev,
        running: false,
        currentFilePath: null,
      }));
    },
    [reviewFile],
  );

  /**
   * 停止批量审查（当前文件完成后生效）
   */
  const stopBatchReview = useCallback(() => {
    if (!batchRunningRef.current) return;
    batchRunId.current += 1;
  }, []);

  /**
   * 重置批量审查状态
   */
  const resetBatchReview = useCallback(() => {
    batchRunningRef.current = false;
    batchRunId.current += 1;
    setBatchState(DEFAULT_BATCH_STATE);
  }, []);

  /**
   * 清除指定文件的审查结果
   */
  const clearFileResult = useCallback(
    (filePath: string) => {
      updateFileState(filePath, {
        result: null,
        error: null,
        loading: false,
      });
    },
    [updateFileState],
  );

  /**
   * 清除所有文件的审查结果
   */
  const clearAllResults = useCallback(() => {
    setFilesState(new Map());
    pendingRequests.current.clear();
  }, []);

  return {
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
}
