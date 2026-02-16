/**
 * OpenAI 兼容 API 适配器
 * 构造时接收不可变配置快照，消除可变单例风险
 */

import type { AIConfig } from "../../types/gitlab";
import type { AIReviewResult } from "../ai";
import { request } from "../net/http-client";
import type { ProviderAdapter, ReviewRequest } from "./types";
import {
  SYSTEM_ROLE,
  JSON_FORMAT_SPEC,
  formatRules,
  formatRequirements,
  buildLanguageConstraint,
  parseReviewResult,
} from "./prompt-constants";

/** OpenAI 兼容的消息格式 */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** OpenAI 兼容的请求格式 */
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  thinking?: {
    type?: "enabled" | "disabled";
    clear_thinking?: boolean;
  };
}

/** OpenAI 兼容的响应格式 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 从 AIConfig 中解析出的请求配置 */
interface OpenAIRequestConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
  modelId: string;
}

const FIXED_MAX_TOKENS = 4000;

/**
 * OpenAI 兼容 API 适配器
 * 每次审查创建新实例，配置在构造时冻结
 */
export const createOpenAIAdapter = (config: AIConfig): ProviderAdapter => {
  /**
   * 获取选中的供应商配置
   */
  const getSelectedProvider = () => {
    if (!config.providerId) return null;
    return (
      config.modeProviders.find((item) => item.id === config.providerId) || null
    );
  };

  /**
   * 根据 API 路由解析请求模型名
   * - 默认使用模型 ID
   * - OpenRouter 需要 provider/model 形式
   */
  const resolveRequestModelName = (
    apiUrl: string,
    providerId: string,
    modelId: string,
  ): string => {
    if (!modelId) return modelId;

    // 用户已填完整模型名时不做二次拼接
    if (modelId.includes("/")) {
      return modelId;
    }

    const normalizedApiUrl = apiUrl.toLowerCase();
    const requiresProviderPrefix = normalizedApiUrl.includes("openrouter.ai");

    if (requiresProviderPrefix) {
      return `${providerId.trim()}/${modelId}`;
    }

    return modelId;
  };

  /**
   * 获取 OpenAI 请求配置
   */
  const getRequestConfig = (): OpenAIRequestConfig | null => {
    const provider = getSelectedProvider();
    if (!provider || !config.modelId) {
      return null;
    }
    const model = provider.models.find((item) => item.id === config.modelId);
    if (!model) {
      return null;
    }
    if (!provider.id || !model.id || !provider.apiUrl || !provider.apiKey) {
      return null;
    }

    const modelId = model.id.trim();
    const modelName = resolveRequestModelName(
      provider.apiUrl,
      provider.id,
      modelId,
    );

    return {
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey,
      modelName,
      modelId,
    };
  };

  /**
   * 结构化输出时，是否需要显式关闭 thinking
   */
  const shouldDisableThinkingForStructuredOutput = (): boolean => {
    const requestConfig = getRequestConfig();
    if (!requestConfig) return false;
    const apiUrl = requestConfig.apiUrl.toLowerCase();
    const model = requestConfig.modelId.toLowerCase();
    return apiUrl.includes("bigmodel.cn") || model.startsWith("glm-");
  };

  /**
   * 从响应中提取内容
   */
  const extractContent = (response: ChatCompletionResponse): string => {
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error("AI 返回空响应");
    }

    const content = choice.message?.content;
    if (content) {
      return content;
    }

    if (choice.finish_reason === "length") {
      throw new Error("AI 输出被截断：达到 max_tokens 限制，未生成最终内容");
    }

    if (choice.message?.reasoning_content) {
      throw new Error("AI 仅返回 reasoning_content，未返回可用内容");
    }

    throw new Error("AI 返回空内容");
  };

  /**
   * 生成常见错误的补充提示
   */
  const buildApiErrorHint = (
    errorText: string,
    requestModel: string,
  ): string => {
    if (errorText.includes('"code":"1211"')) {
      return `\n提示：当前模型为 "${requestModel}"，请检查模型 ID 是否与供应商接口要求一致（多数 OpenAI 兼容接口只需要模型 ID，如 "glm-4-plus"）。`;
    }
    return "";
  };

  /**
   * 发送请求到 AI API
   */
  const sendChatCompletion = async (
    chatRequest: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResponse> => {
    const requestConfig = getRequestConfig();
    if (!requestConfig) {
      throw new Error("未找到可用的 OpenAI 供应商配置");
    }

    const mergedRequest: ChatCompletionRequest = {
      ...chatRequest,
      max_tokens: FIXED_MAX_TOKENS,
    };

    try {
      return await request<ChatCompletionResponse>({
        url: `${requestConfig.apiUrl}/chat/completions`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${requestConfig.apiKey}`,
        },
        body: mergedRequest,
        timeoutMs: 60000,
        signal,
        provider: "openai",
        retry: { maxRetries: 2 },
      });
    } catch (error) {
      // 保持向后兼容的错误信息格式
      const msg = error instanceof Error ? error.message : String(error);
      const hint = buildApiErrorHint(msg, chatRequest.model);
      if (hint) {
        throw new Error(`${msg}${hint}`);
      }
      throw error;
    }
  };

  /**
   * 构建系统提示词（结构化）
   * 使用共享常量组装，OpenAI 模式通过 response_format 约束 JSON，无需代码块包裹
   */
  const buildStructuredSystemPrompt = (
    rules: string[],
    language: string,
  ): string => {
    const rulesText = formatRules(rules);
    const requirements = formatRequirements();

    return `${SYSTEM_ROLE}

${rulesText}

请以 JSON 格式返回审查结果，不要包含任何其他内容：
${JSON_FORMAT_SPEC}

要求：
${requirements}

${buildLanguageConstraint(language)}`;
  };

  return {
    async reviewStructured(request: ReviewRequest): Promise<AIReviewResult> {
      const requestConfig = getRequestConfig();
      if (!requestConfig) {
        throw new Error("AI 服务未初始化，请先配置模型供应商和模型");
      }

      const systemPrompt = buildStructuredSystemPrompt(
        request.rules,
        request.language,
      );
      const chatRequest: ChatCompletionRequest = {
        model: requestConfig.modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: request.diff },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      };

      // GLM 系列模型默认开启 thinking，结构化输出时显式关闭可避免只返回 reasoning_content
      if (shouldDisableThinkingForStructuredOutput()) {
        chatRequest.thinking = { type: "disabled", clear_thinking: true };
      }

      const response = await sendChatCompletion(chatRequest, request.signal);
      const content = extractContent(response);
      return parseReviewResult(content);
    },

    async isAvailable(): Promise<boolean> {
      const requestConfig = getRequestConfig();
      return Boolean(
        requestConfig?.apiUrl &&
          requestConfig?.apiKey &&
          requestConfig?.modelName,
      );
    },
  };
};
