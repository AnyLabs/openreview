/**
 * 重试策略
 * 指数退避 + 随机抖动，仅对可重试错误生效
 */

import { type ServiceError, isRetryableStatus, isNetworkError } from "./errors";

/** 重试配置 */
export interface RetryOptions {
  /** 最大重试次数，默认 2 */
  maxRetries?: number;
  /** 基础延迟 ms，默认 1000 */
  baseDelayMs?: number;
  /** 最大延迟 ms，默认 10000 */
  maxDelayMs?: number;
  /** 自定义重试判断（覆盖默认逻辑） */
  shouldRetry?: (error: ServiceError) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "shouldRetry">> = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * 计算指数退避延迟（含随机抖动）
 */
const calculateDelay = (
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number => {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs * 0.5;
  return Math.min(exponential + jitter, maxDelayMs);
};

/**
 * 默认重试判断逻辑
 * - 网络错误 → 可重试
 * - 429/5xx → 可重试
 * - 其他 → 不重试
 */
const defaultShouldRetry = (error: unknown): boolean => {
  if (isNetworkError(error)) return true;
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return isRetryableStatus((error as { status: number }).status);
  }
  // ServiceError 类型
  if (
    error &&
    typeof error === "object" &&
    "retryable" in error
  ) {
    return (error as ServiceError).retryable;
  }
  return false;
};

/**
 * 带重试的异步函数执行器
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试配置
 * @returns 函数的返回值
 * @throws 最后一次尝试的错误
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> => {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    baseDelayMs = DEFAULT_OPTIONS.baseDelayMs,
    maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
  } = options ?? {};
  const shouldRetry = options?.shouldRetry
    ? (e: unknown) => {
        if (
          e &&
          typeof e === "object" &&
          "provider" in e
        ) {
          return options.shouldRetry!(e as ServiceError);
        }
        return defaultShouldRetry(e);
      }
    : defaultShouldRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 最后一次尝试不再重试
      if (attempt >= maxRetries) break;

      // 不可重试的错误直接抛出
      if (!shouldRetry(error)) break;

      // AbortError 不重试
      if (error instanceof DOMException && error.name === "AbortError") break;

      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[RetryPolicy] 第 ${attempt + 1}/${maxRetries} 次重试，等待 ${Math.round(delay)}ms`,
        error instanceof Error ? error.message : error,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};
