/**
 * 统一错误结构
 * 所有外部服务请求的错误均使用此格式，确保错误信息可观测且可定位
 */

/** 统一服务错误 */
export interface ServiceError {
  /** 供应商标识 */
  provider: "openai" | "system";
  /** HTTP 状态码 */
  status?: number;
  /** 错误码 */
  code?: string;
  /** 用户友好的错误信息 */
  message: string;
  /** 请求 ID（用于排查） */
  requestId?: string;
  /** 是否可重试 */
  retryable: boolean;
}

/**
 * 判断 HTTP 状态码是否可重试
 * - 无状态码（网络错误）→ 可重试
 * - 429（限流）→ 可重试
 * - 5xx（服务端错误）→ 可重试
 */
export const isRetryableStatus = (status?: number): boolean =>
  !status || status === 429 || (status >= 500 && status < 600);

/**
 * 判断错误类型是否为网络错误（可重试）
 */
export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    // fetch 的网络错误通常是 TypeError
    const msg = error.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("aborted") ||
      msg.includes("timeout")
    );
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return false;
};

/**
 * 创建标准化服务错误
 */
export const createServiceError = (options: {
  provider: ServiceError["provider"];
  status?: number;
  code?: string;
  message: string;
  requestId?: string;
}): ServiceError => ({
  ...options,
  retryable: isRetryableStatus(options.status),
});

/**
 * ServiceError 转为标准 Error 对象（用于向上层抛出）
 */
export const toError = (serviceError: ServiceError): Error => {
  const parts = [`[${serviceError.provider}]`];
  if (serviceError.status) parts.push(`${serviceError.status}`);
  if (serviceError.code) parts.push(`(${serviceError.code})`);
  parts.push(serviceError.message);
  if (serviceError.requestId) {
    parts.push(`[requestId: ${serviceError.requestId}]`);
  }
  return new Error(parts.join(" "));
};
