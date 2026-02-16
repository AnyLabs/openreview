/**
 * 统一审查引擎
 * 接受统一请求参数，调用 OpenAI 兼容适配器执行审查
 * Hook 层只需调用此入口，无需感知协议细节
 */

import type { AIConfig } from "../types/gitlab";
import type { AIReviewResult } from "./ai";
import { createOpenAIAdapter } from "./adapters/openai-adapter";

/**
 * 校验配置完整性
 * @returns 错误消息或 null
 */
const validateConfig = (aiConfig: AIConfig): string | null => {
  const provider = aiConfig.providerId
    ? aiConfig.modeProviders.find((item) => item.id === aiConfig.providerId)
    : undefined;
  const model = provider?.models.find((item) => item.id === aiConfig.modelId);
  if (
    !provider?.id ||
    !provider?.apiUrl ||
    !provider?.apiKey ||
    !model?.id
  ) {
    return "请先配置并选择模型供应商与模型";
  }
  return null;
};

/**
 * 执行代码审查
 *
 * 核心入口：创建适配器实例，执行结构化审查
 *
 * @param aiConfig - AI 配置（不可变快照）
 * @param diff - 代码差异内容
 * @param signal - 可选的 AbortSignal
 * @returns 审查结果
 * @throws Error 配置不完整或审查失败时抛出
 */
export const executeReview = async (
  aiConfig: AIConfig,
  diff: string,
  signal?: AbortSignal,
): Promise<AIReviewResult> => {
  // 校验配置
  const error = validateConfig(aiConfig);
  if (error) throw new Error(error);

  // 创建适配器实例并执行审查
  const adapter = createOpenAIAdapter(aiConfig);

  return adapter.reviewStructured({
    diff,
    rules: aiConfig.rules,
    language: aiConfig.language,
    signal,
  });
};
