/**
 * 统一 HTTP 客户端
 * 封装 fetch + timeout + retry + 统一错误结构 + 代理路由
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
 * 代理路由配置
 */
const PROXY_ROUTES: Record<string, { proxyUrl: string; description: string }> = {
  "opencode.ai": {
    proxyUrl: "/api/opencode",
    description: "OpenCode AI API 代理",
  },
  // 可以在这里添加其他域名的代理配置
  // "api.openai.com": {
  //   proxyUrl: "/api/openai",
  //   description: "OpenAI API 代理",
  // },
};

/**
 * 解析并应用代理路由
 * @param url 原始 URL
 * @returns 处理后的 URL
 */
function resolveProxyUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // 检查是否有代理配置
    const proxyConfig = PROXY_ROUTES[hostname];
    if (proxyConfig) {
      // 在开发环境中使用代理路径
      if (typeof window !== "undefined" && window.location.hostname === "127.0.0.1") {
        const proxyUrl = `${proxyConfig.proxyUrl}${urlObj.pathname}${urlObj.search}`;
        console.log(`${proxyConfig.description}: ${url} -> ${proxyUrl}`);
        return proxyUrl;
      }
    }

    // 生产环境或无代理配置时直接返回原始 URL
    return url;
  } catch {
    // URL 解析失败时返回原始 URL
    return url;
  }
}

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
      // 解析代理路由
      const resolvedUrl = resolveProxyUrl(url);

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal,
      };

      if (body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(resolvedUrl, fetchOptions);

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
