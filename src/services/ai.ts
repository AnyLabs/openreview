/**
 * AI 服务
 * 使用 OpenAI 兼容的 API 进行代码审查
 */

import type { AIConfig } from "../types/gitlab";

/** AI 审查评论 */
export interface AIReviewComment {
  /** 行号 */
  line: number;
  /** 评论内容 */
  content: string;
  /** 严重程度 */
  severity: "info" | "warning" | "error";
}

/** AI 审查结果 */
export interface AIReviewResult {
  /** 总结 */
  summary: string;
  /** 评论列表 */
  comments: AIReviewComment[];
  /** 耗时 (ms) */
  duration?: number;
}

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
      reasoning_content?: string; // 智谱 GLM-4 特有字段
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * AI 服务类
 */
export class AIService {
  private config: AIConfig | null = null;
  private static readonly FIXED_MAX_TOKENS = 4000;

  private getSelectedProvider() {
    if (!this.config?.providerId) return null;
    return (
      this.config.modeProviders.find(
        (item) => item.id === this.config?.providerId,
      ) || null
    );
  }

  private getOpenAIRequestConfig() {
    const provider = this.getSelectedProvider();
    if (!provider || !this.config?.modelId) {
      return null;
    }
    const model = provider.models.find(
      (item) => item.id === this.config?.modelId,
    );
    if (!model) {
      return null;
    }
    if (!provider.id || !model.id || !provider.apiUrl || !provider.apiKey) {
      return null;
    }

    const modelId = model.id.trim();
    const modelName = this.resolveRequestModelName(
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
  }

  /**
   * 根据 API 路由解析请求模型名
   * - 默认使用模型 ID
   * - OpenRouter 需要 provider/model 形式
   */
  private resolveRequestModelName(
    apiUrl: string,
    providerId: string,
    modelId: string,
  ): string {
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
  }

  /**
   * 初始化 AI 服务
   */
  init(config: AIConfig): void {
    this.config = config;
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    const requestConfig = this.getOpenAIRequestConfig();
    return Boolean(
      requestConfig?.apiUrl &&
      requestConfig?.apiKey &&
      requestConfig?.modelName,
    );
  }

  /**
   * 执行代码审查（纯文本结果）
   */
  async reviewCode(diff: string, rules?: string[]): Promise<string> {
    if (!this.config) {
      throw new Error("AI 服务未初始化，请先配置 API Key");
    }

    const systemPrompt = this.buildSystemPrompt(rules ?? this.config.rules);
    const requestConfig = this.getOpenAIRequestConfig();
    if (!requestConfig) {
      throw new Error("AI 服务未初始化，请先配置模型供应商和模型");
    }
    const response = await this.sendChatCompletion({
      model: requestConfig.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: diff },
      ],
      temperature: 0.3,
    });

    return this.extractContent(response);
  }

  /**
   * 执行代码审查（结构化结果）
   */
  async reviewCodeStructured(
    diff: string,
    rules?: string[],
  ): Promise<AIReviewResult> {
    if (!this.config) {
      throw new Error("AI 服务未初始化，请先配置 API Key");
    }

    const systemPrompt = this.buildStructuredSystemPrompt(
      rules ?? this.config.rules,
    );
    const requestConfig = this.getOpenAIRequestConfig();
    if (!requestConfig) {
      throw new Error("AI 服务未初始化，请先配置模型供应商和模型");
    }
    const request: ChatCompletionRequest = {
      model: requestConfig.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: diff },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    };

    // GLM 系列模型默认开启 thinking，结构化输出时显式关闭可避免只返回 reasoning_content
    if (this.shouldDisableThinkingForStructuredOutput()) {
      request.thinking = { type: "disabled", clear_thinking: true };
    }

    const response = await this.sendChatCompletion(request);

    const content = this.extractContent(response);
    return this.parseReviewResult(content);
  }

  /**
   * 发送请求到 AI API
   */
  private async sendChatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    if (!this.config) {
      throw new Error("AI 服务未初始化");
    }
    const requestConfig = this.getOpenAIRequestConfig();
    if (!requestConfig) {
      throw new Error("未找到可用的 OpenAI 供应商配置");
    }

    const mergedRequest: ChatCompletionRequest = {
      ...request,
      max_tokens: AIService.FIXED_MAX_TOKENS,
    };

    const response = await fetch(`${requestConfig.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requestConfig.apiKey}`,
      },
      body: JSON.stringify(mergedRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const hint = this.buildApiErrorHint(errorText, request.model);
      throw new Error(`AI API 错误: ${response.status} - ${errorText}${hint}`);
    }

    return response.json();
  }

  /**
   * 生成常见错误的补充提示
   */
  private buildApiErrorHint(errorText: string, requestModel: string): string {
    if (errorText.includes('"code":"1211"')) {
      return `\n提示：当前模型为 "${requestModel}"，请检查模型 ID 是否与供应商接口要求一致（多数 OpenAI 兼容接口只需要模型 ID，如 "glm-4-plus"）。`;
    }
    return "";
  }

  /**
   * 从响应中提取内容
   */
  private extractContent(response: ChatCompletionResponse): string {
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
  }

  /**
   * 结构化输出时，是否需要显式关闭 thinking
   */
  private shouldDisableThinkingForStructuredOutput(): boolean {
    if (!this.config) return false;
    const requestConfig = this.getOpenAIRequestConfig();
    if (!requestConfig) return false;
    const apiUrl = requestConfig.apiUrl.toLowerCase();
    const model = requestConfig.modelId.toLowerCase();
    return apiUrl.includes("bigmodel.cn") || model.startsWith("glm-");
  }

  /**
   * 构建系统提示词（纯文本）
   */
  private buildSystemPrompt(rules: string[]): string {
    const rulesText =
      rules.length > 0
        ? rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
        : "1. 检查潜在的 bug 和逻辑错误\n2. 验证错误处理是否恰当\n3. 确保代码遵循最佳实践";

    const language = this.config?.language || "中文";

    return `你是一位专业的代码审查专家。请根据以下规则审查代码差异：

${rulesText}

审查要点：
- 可能导致 bug 或安全漏洞的严重问题
- 重要的改进建议
- 代码风格和最佳实践的小建议

请尽可能具体地指出行号。

重要：所有响应必须使用${language}。`;
  }

  /**
   * 构建系统提示词（结构化）
   */
  private buildStructuredSystemPrompt(rules: string[]): string {
    const rulesText =
      rules.length > 0
        ? rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
        : "1. 检查潜在的 bug 和逻辑错误";

    const language = this.config?.language || "中文";

    return `你是一位专业的代码审查专家。请根据以下规则审查代码差异：

${rulesText}

请以 JSON 格式返回审查结果，不要包含任何其他内容：
{
  "summary": "总体评价（100字以内，简洁明了）",
  "comments": [
    {
      "line": 10,
      "content": "问题或建议",
      "severity": "error|warning|info"
    }
  ]
}

要求：
1. summary 必须控制在 100 字以内，简洁概括主要问题
2. 只包含有意义的评论，要具体且可操作
3. 不要返回思考过程或分析步骤
4. 只返回 JSON 格式数据，不要有其他文字

重要：所有响应必须使用${language}。`;
  }

  /**
   * 解析审查结果
   */
  private parseReviewResult(content: string): AIReviewResult {
    try {
      // 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

      const parsed = JSON.parse(jsonStr);
      return {
        summary: parsed.summary || "无总结",
        comments: (parsed.comments || []).map(
          (c: Record<string, unknown>): AIReviewComment => ({
            line: typeof c.line === "number" ? c.line : 1,
            content: String(c.content || ""),
            severity: ["error", "warning", "info"].includes(
              c.severity as string,
            )
              ? (c.severity as "error" | "warning" | "info")
              : "info",
          }),
        ),
      };
    } catch {
      // 解析失败时，返回错误提示而不是原始内容
      return {
        summary: "审查结果解析失败，请检查 AI 响应格式",
        comments: [],
      };
    }
  }
}

// 单例实例
let aiService: AIService | null = null;

/**
 * 获取 AI 服务实例
 */
export function getAIService(): AIService {
  if (!aiService) {
    aiService = new AIService();
  }
  return aiService;
}

/**
 * 初始化 AI 服务
 */
export function initAIService(config: AIConfig): void {
  getAIService().init(config);
}
