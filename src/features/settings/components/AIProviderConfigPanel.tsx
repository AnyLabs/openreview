/**
 * 兼容占位组件：旧版系统配置中的模型供应商编辑面板。
 * 当前版本已迁移到独立弹窗，保留该文件仅用于兼容历史引用。
 */

import type { AIProvider } from "../../../types/gitlab";

interface AIProviderConfigPanelProps {
  modeProviders: AIProvider[];
  setModeProviders: React.Dispatch<React.SetStateAction<AIProvider[]>>;
  providerId: string;
  setProviderId: (value: string) => void;
  modelId: string;
  setModelId: (value: string) => void;
  providerError?: string;
  modelError?: string;
  onClearError: (field: "providerId" | "modelId") => void;
}

export function AIProviderConfigPanel(_props: AIProviderConfigPanelProps) {
  return null;
}
