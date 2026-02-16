/**
 * 统一 HTTP 客户端
 * 封装 fetch + timeout + retry + 统一错误结构
 */

import { createServiceError, isRetryableStatus, toError } from "./errors";
import { withRetry, type RetryOptions } from "./retry-policy";

/** 请求配置 */
export interface RequestOptions {
  /** 请求 URL */
  url: string;
  /** HTTP 方法，默认 GET */
  method?: "GET" | "POST";
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体（POST 时自动 JSON.stringify） */
  body?: unknown;
  /** 超时 ms，默认 30000 */
  timeoutMs?: number;
  /** 外部 AbortSignal（如用户主动取消） */
  signal?: AbortSignal;
  /** 重试配置，设为 false 禁用重试 */
  retry?: RetryOptions | false;
  /** 供应商标识（用于错误结构） */
  provider?: "openai" | "system";
}

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * 合并外部 signal 与超时 signal
 */
const createCombinedSignal = (
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } => {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  // 如果没有外部 signal，直接用 timeout signal
  if (!externalSignal) {
    return {
      signal: timeoutController.signal,
      cleanup: () => clearTimeout(timer),
    };
  }

  // 合并两个 signal：任一触发则取消
  const combined = AbortSignal.any([
    timeoutController.signal,
    externalSignal,
  ]);

  return {
    signal: combined,
    cleanup: () => clearTimeout(timer),
  };
};

/**
 * 发送 HTTP 请求
 *
 * 自动附加：
 * - 超时控制（默认 30s）
 * - 重试策略（默认 2 次，仅网络错误/429/5xx）
 * - 统一错误结构
 * - AbortSignal 支持
 */
export const request = async <T>(options: RequestOptions): Promise<T> => {
  const {
    url,
    method = "GET",
    headers,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    retry,
    provider = "system",
  } = options;

  const doFetch = async (): Promise<T> => {
    const { signal, cleanup } = createCombinedSignal(timeoutMs, externalSignal);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal,
      };

      if (body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const serviceError = createServiceError({
          provider,
          status: response.status,
          message: `HTTP ${response.status}: ${errorText}`,
        });

        // 可重试的状态码，抛出带 status 的错误让 retry-policy 判断
        if (isRetryableStatus(response.status)) {
          const err = toError(serviceError) as Error & { status?: number };
          err.status = response.status;
          throw err;
        }

        throw toError(serviceError);
      }

      // 尝试解析 JSON，如果失败则返回文本
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      return (await response.text()) as unknown as T;
    } catch (error) {
      // 超时错误转换为友好提示
      if (error instanceof DOMException && error.name === "AbortError") {
        // 区分用户取消和超时
        if (externalSignal?.aborted) {
          throw toError(
            createServiceError({
              provider,
              code: "CANCELLED",
              message: "请求已被取消",
            }),
          );
        }
        throw toError(
          createServiceError({
            provider,
            code: "TIMEOUT",
            message: `请求超时（${timeoutMs / 1000}s）`,
          }),
        );
      }
      throw error;
    } finally {
      cleanup();
    }
  };

  // 禁用重试
  if (retry === false) {
    return doFetch();
  }

  return withRetry(doFetch, retry);
};
