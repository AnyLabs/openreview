/**
 * Provider Adapter 接口与统一类型定义
 * 所有 AI 审查供应商适配器需实现此接口
 */

import type { AIReviewResult } from "../ai";

/** 审查请求参数（不可变） */
export interface ReviewRequest {
  /** diff 内容 */
  diff: string;
  /** 审查规则列表 */
  rules: string[];
  /** 审查语言 */
  language: string;
  /** 取消信号（预留阶段 2 使用） */
  signal?: AbortSignal;
}

/** 统一错误结构 */
export interface ReviewError {
  /** 供应商标识 */
  provider: "openai";
  /** HTTP 状态码 */
  status?: number;
  /** 错误码 */
  code?: string;
  /** 错误信息 */
  message: string;
  /** 请求 ID（用于排查） */
  requestId?: string;
}

/**
 * Provider 适配器接口
 * 每次审查请求创建新实例，配置不可变
 */
export interface ProviderAdapter {
  /** 执行结构化代码审查 */
  reviewStructured(request: ReviewRequest): Promise<AIReviewResult>;
  /** 检查服务是否可用 */
  isAvailable(): Promise<boolean>;
}
