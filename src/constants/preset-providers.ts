/**
 * 内置常见 AI 供应商预设列表
 * 用于新增/编辑供应商时提供搜索选择和自动填充
 */

import type { AIProvider } from "../types/gitlab";

/** 预设供应商配置（不含 apiKey，由用户手动填写） */
export const PRESET_PROVIDERS: AIProvider[] = [
  {
    name: "OpenAI",
    id: "openai",
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    models: [
      { name: "GPT-4o", id: "gpt-4o" },
      { name: "GPT-4o Mini", id: "gpt-4o-mini" },
      { name: "GPT-4", id: "gpt-4" },
    ],
  },
  {
    name: "Anthropic",
    id: "anthropic",
    apiUrl: "https://api.anthropic.com/v1",
    apiKey: "",
    models: [
      { name: "Claude Sonnet 4", id: "claude-sonnet-4-20250514" },
      { name: "Claude Haiku 3.5", id: "claude-3-5-haiku-20241022" },
    ],
  },
  {
    name: "Google AI",
    id: "google-ai",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: "",
    models: [
      { name: "Gemini 2.5 Pro", id: "gemini-2.5-pro-preview-06-05" },
      { name: "Gemini 2.5 Flash", id: "gemini-2.5-flash-preview-05-20" },
    ],
  },
  {
    name: "智谱 AI",
    id: "zhipuai",
    apiUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "",
    models: [
      { name: "GLM-4-Plus", id: "glm-4-plus" },
      { name: "GLM-4-Flash", id: "glm-4-flash" },
    ],
  },
  {
    name: "DeepSeek",
    id: "deepseek",
    apiUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    models: [
      { name: "DeepSeek Chat", id: "deepseek-chat" },
      { name: "DeepSeek Reasoner", id: "deepseek-reasoner" },
    ],
  },
  {
    name: "月之暗面",
    id: "moonshot",
    apiUrl: "https://api.moonshot.cn/v1",
    apiKey: "",
    models: [
      { name: "Moonshot v1 128K", id: "moonshot-v1-128k" },
      { name: "Moonshot v1 32K", id: "moonshot-v1-32k" },
    ],
  },
];

/**
 * 根据供应商 ID 查找预设配置
 */
export const findPresetProvider = (id: string): AIProvider | undefined =>
  PRESET_PROVIDERS.find((p) => p.id === id);
