/**
 * AI 审查 Hook
 * 管理 AI 代码审查状态
 * 通过 ReviewEngine 统一调用，不再感知协议细节
 */

import { useState, useCallback } from "react";
import type { AIReviewResult } from "../services/ai";
import { executeReview } from "../services/review-engine";
import { useApp } from "../contexts/AppContext";

/** AI 审查状态 */
export interface AIReviewState {
  /** 是否正在审查 */
  loading: boolean;
  /** 审查结果 */
  result: AIReviewResult | null;
  /** 错误信息 */
  error: string | null;
}

/**
 * AI 审查 Hook
 */
export function useAIReview() {
  const [state] = useApp();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * 执行代码审查
   */
  const review = useCallback(
    async (diff: string) => {
      const { ai } = state.config;

      setLoading(true);
      setError(null);
      setResult(null);

      const startTime = Date.now();

      try {
        const reviewResult = await executeReview(ai, diff);
        const duration = Date.now() - startTime;
        setResult({ ...reviewResult, duration });
      } catch (e) {
        setError(e instanceof Error ? e.message : "审查失败");
      } finally {
        setLoading(false);
      }
    },
    [state.config],
  );

  /**
   * 清除结果
   */
  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    loading,
    result,
    error,
    review,
    clear,
  };
}
