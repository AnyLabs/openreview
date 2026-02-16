/**
 * 配置存储服务
 * 使用 Tauri Store 存储应用配置
 */

import { isTauri } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";
import type {
  AppConfig,
  GitLabConfig,
  AIConfig,
  AIProviderList,
} from "../types/gitlab";
import { PRESET_PROVIDERS } from "../constants/preset-providers";

export type ThemePreference = "dark" | "light" | "system";

interface StoredSecret {
  mode: "plain" | "enc";
  value: string;
  iv?: string;
}

interface AppConfigStoreV3 {
  schemaVersion: 3;
  profile: {
    gitlabUrl: string;
    providerId?: string;
    modelId?: string;
    modeProviders: AIProviderList;
    language: string;
    rules: string[];
    theme?: ThemePreference;
  };
  secrets: {
    providerApiKeys?: Record<string, StoredSecret>;
    gitlabToken?: StoredSecret;
  };
  sync: {
    enabled: boolean;
    deviceId: string;
    revision: number;
    lastSyncedAt?: string;
    dirtyFields: string[];
  };
  meta: {
    createdAt: string;
    updatedAt: string;
  };
}

interface AppConfigStoreV2Legacy {
  schemaVersion: 2;
  profile: {
    gitlabUrl: string;
    aiProvider: "openai";
    apiUrl: string;
    modelName: string;
    language: string;
    rules: string[];
    theme?: ThemePreference;
  };
}

const WEB_STORAGE_CONFIG_KEY = "code-reviewer-config";
const WEB_STORAGE_THEME_KEY = "theme";
const DEVICE_ID_KEY = "device-id";
const STORE_PATH = "settings.json";
const STORE_CONFIG_KEY = "app_config";
const STORE_THEME_KEY = "theme";

// 可选加密开关：开启后优先尝试加密，失败会自动降级为明文存储
const ENABLE_OPTIONAL_SECRET_ENCRYPTION = true;
const SECRET_KEY_NS = "com.nooldey.code-reviewer.v3";

let storeInstance: LazyStore | null = null;

/** 默认配置 */
export const DEFAULT_CONFIG: AppConfig = {
  gitlab: {
    url: "https://gitlab.com",
    token: "",
  },
  ai: {
    providerId: "openai",
    modelId: "gpt-4",
    modeProviders: PRESET_PROVIDERS.slice(0, 1),
    language: "简体中文",
    rules: [],
  },
};

function cloneDefaultConfig(): AppConfig {
  return {
    gitlab: { ...DEFAULT_CONFIG.gitlab },
    ai: { ...DEFAULT_CONFIG.ai, rules: [...DEFAULT_CONFIG.ai.rules] },
  };
}

interface LegacyAIConfigShape {
  ProviderId?: string;
  ModelId?: string;
  ModeProviders?: AIProviderList;
}

function normalizeModeProviders(modeProviders: AIProviderList): AIProviderList {
  return (modeProviders || []).map((provider) => {
    const providerId = provider.id;
    const models = (provider.models || []).map((model) => ({
      ...model,
      id: model.id,
    }));

    return {
      ...provider,
      id: providerId,
      apiUrl: provider.apiUrl || "",
      apiKey: provider.apiKey || "",
      models,
    };
  });
}

function mergeWithDefault(config?: Partial<AppConfig> | null): AppConfig {
  if (!config) return cloneDefaultConfig();
  const aiInput = (config.ai ?? {}) as Partial<AIConfig> & LegacyAIConfigShape;
  const normalizedProviders = aiInput.modeProviders
    ? normalizeModeProviders(aiInput.modeProviders)
    : aiInput.ModeProviders
      ? normalizeModeProviders(aiInput.ModeProviders)
      : DEFAULT_CONFIG.ai.modeProviders;

  const normalizedAI: AIConfig = {
    ...DEFAULT_CONFIG.ai,
    ...aiInput,
    providerId: aiInput.providerId ?? aiInput.ProviderId ?? DEFAULT_CONFIG.ai.providerId,
    modelId: aiInput.modelId ?? aiInput.ModelId ?? DEFAULT_CONFIG.ai.modelId,
    modeProviders: normalizedProviders,
  };

  return {
    gitlab: { ...DEFAULT_CONFIG.gitlab, ...config.gitlab },
    ai: normalizedAI,
  };
}

function getStore(): LazyStore {
  if (!storeInstance) {
    storeInstance = new LazyStore(STORE_PATH);
  }
  return storeInstance;
}

function normalizeTheme(value?: string): ThemePreference | undefined {
  return value === "dark" || value === "light" || value === "system"
    ? value
    : undefined;
}

function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

function readWebConfig(): Partial<AppConfig> | null {
  try {
    const stored = localStorage.getItem(WEB_STORAGE_CONFIG_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Partial<AppConfig>;
  } catch (e) {
    console.error("Failed to parse legacy config:", e);
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveSecretKey(): Promise<CryptoKey | null> {
  if (!ENABLE_OPTIONAL_SECRET_ENCRYPTION) return null;
  if (!globalThis.crypto?.subtle) return null;

  const raw = new TextEncoder().encode(`${SECRET_KEY_NS}:${getDeviceId()}`);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encodeSecret(value: string): Promise<StoredSecret | undefined> {
  if (!value) return undefined;

  try {
    const key = await deriveSecretKey();
    if (!key) {
      return { mode: "plain", value };
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(value)
    );
    return {
      mode: "enc",
      value: toBase64(new Uint8Array(ciphertext)),
      iv: toBase64(iv),
    };
  } catch (e) {
    console.error("Secret encryption failed, fallback to plain:", e);
    return { mode: "plain", value };
  }
}

async function decodeSecret(secret?: StoredSecret): Promise<string> {
  if (!secret?.value) return "";
  if (secret.mode === "plain") return secret.value;

  try {
    const key = await deriveSecretKey();
    if (!key || !secret.iv) return "";
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(secret.iv) },
      key,
      fromBase64(secret.value)
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Secret decryption failed:", e);
    return "";
  }
}

async function toStoreConfig(config: AppConfig, theme?: ThemePreference): Promise<AppConfigStoreV3> {
  const providerApiKeys: Record<string, StoredSecret> = {};
  const modeProviders = config.ai.modeProviders.map((provider) => ({
    ...provider,
    apiKey: "",
    models: provider.models,
  }));

  for (const provider of config.ai.modeProviders) {
    if (provider.apiKey) {
      const encodedProviderKey = await encodeSecret(provider.apiKey);
      if (encodedProviderKey) {
        providerApiKeys[provider.id] = encodedProviderKey;
      }
    }

  }

  const now = new Date().toISOString();
  return {
    schemaVersion: 3,
    profile: {
      gitlabUrl: config.gitlab.url,
      providerId: config.ai.providerId,
      modelId: config.ai.modelId,
      modeProviders,
      language: config.ai.language,
      rules: config.ai.rules ?? [],
      theme,
    },
    secrets: {
      providerApiKeys,
      gitlabToken: await encodeSecret(config.gitlab.token),
    },
    sync: {
      enabled: false,
      deviceId: getDeviceId(),
      revision: 0,
      dirtyFields: [],
    },
    meta: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function fromStoreV3Config(storeConfig: AppConfigStoreV3): Promise<AppConfig> {
  const providerApiKeyMap: Record<string, string> = {};
  if (storeConfig.secrets.providerApiKeys) {
    for (const [providerName, secret] of Object.entries(
      storeConfig.secrets.providerApiKeys
    )) {
      providerApiKeyMap[providerName] = await decodeSecret(secret);
    }
  }
  const modeProviders = (storeConfig.profile.modeProviders ?? []).map((provider) => {
    const models = (provider.models || []).map((model) => ({
      ...model,
      id: model.id || model.name,
    }));

    return {
      ...provider,
      id: provider.id,
      apiUrl: provider.apiUrl || "",
      apiKey: providerApiKeyMap[provider.id] || provider.apiKey || "",
      models,
    };
  });

  return mergeWithDefault({
    gitlab: {
      url: storeConfig.profile.gitlabUrl,
      token: await decodeSecret(storeConfig.secrets.gitlabToken),
    },
    ai: {
      providerId: storeConfig.profile.providerId,
      modelId: storeConfig.profile.modelId,
      modeProviders: modeProviders,
      language: storeConfig.profile.language,
      rules: storeConfig.profile.rules ?? [],
    },
  });
}

async function loadFromStore(): Promise<{
  config: AppConfig;
  theme?: ThemePreference;
} | null> {
  const store = getStore();
  const raw = await store.get<unknown>(STORE_CONFIG_KEY);
  if (!raw || typeof raw !== "object") return null;

  const schemaVersion = (raw as { schemaVersion?: number }).schemaVersion;

  if (schemaVersion === 3) {
    const storeConfig = raw as AppConfigStoreV3;
    const config = await fromStoreV3Config(storeConfig);
    const theme =
      normalizeTheme(storeConfig.profile.theme) ??
      normalizeTheme(await store.get<string>(STORE_THEME_KEY));
    return { config, theme };
  }

  // 兼容早期 V2 结构（无 secrets 字段）
  if (schemaVersion === 2) {
    const legacy = raw as AppConfigStoreV2Legacy;
    const config = mergeWithDefault({
      gitlab: { url: legacy.profile.gitlabUrl, token: "" },
      ai: {
        providerId: "legacy-provider",
        modeProviders: [
          {
            name: "兼容迁移供应商",
            id: "legacy-provider",
            apiUrl: legacy.profile.apiUrl,
            apiKey: "",
            models: [{ name: legacy.profile.modelName, id: legacy.profile.modelName }],
          },
        ],
        language: legacy.profile.language,
        rules: legacy.profile.rules ?? [],
      },
    });
    const theme =
      normalizeTheme(legacy.profile.theme) ??
      normalizeTheme(await store.get<string>(STORE_THEME_KEY));
    return { config, theme };
  }

  return null;
}

/** 加载完整配置 */
export async function loadConfig(): Promise<AppConfig> {
  if (!isTauri()) {
    return mergeWithDefault(readWebConfig());
  }

  try {
    const stored = await loadFromStore();
    return stored?.config ?? cloneDefaultConfig();
  } catch (e) {
    console.error("Failed to load config from Tauri Store:", e);
    return cloneDefaultConfig();
  }
}

/** 保存完整配置 */
export async function saveConfig(config: AppConfig): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(WEB_STORAGE_CONFIG_KEY, JSON.stringify(config));
    return;
  }

  const theme = await loadThemePreference();
  const storeConfig = await toStoreConfig(config, theme);
  const store = getStore();
  await store.set(STORE_CONFIG_KEY, storeConfig);
  await store.save();
}

/** 获取 GitLab 配置 */
export async function getGitLabConfig(): Promise<GitLabConfig> {
  return (await loadConfig()).gitlab;
}

/** 保存 GitLab 配置 */
export async function saveGitLabConfig(gitlab: GitLabConfig): Promise<void> {
  const config = await loadConfig();
  config.gitlab = gitlab;
  await saveConfig(config);
}

/** 获取 AI 配置 */
export async function getAIConfig(): Promise<AIConfig> {
  return (await loadConfig()).ai;
}

/** 保存 AI 配置 */
export async function saveAIConfig(ai: AIConfig): Promise<void> {
  const config = await loadConfig();
  config.ai = ai;
  await saveConfig(config);
}

/** 检查 GitLab 是否已配置 */
export async function isGitLabConfigured(): Promise<boolean> {
  const config = await getGitLabConfig();
  return Boolean(config.url && config.token);
}

/** 检查 AI 是否已配置 */
export async function isAIConfigured(): Promise<boolean> {
  const config = await getAIConfig();
  if (!config.providerId || !config.modelId) return false;
  const provider = config.modeProviders.find((p) => p.id === config.providerId);
  if (!provider) return false;
  const model = provider.models.find((m) => m.id === config.modelId);
  return Boolean(provider.apiUrl && provider.apiKey && model?.id);
}

/** 读取主题偏好 */
export async function loadThemePreference(): Promise<ThemePreference | undefined> {
  if (!isTauri()) {
    return normalizeTheme(localStorage.getItem(WEB_STORAGE_THEME_KEY) ?? undefined);
  }

  try {
    const storeData = await loadFromStore();
    return storeData?.theme;
  } catch (e) {
    console.error("Failed to load theme preference:", e);
    return undefined;
  }
}

/** 保存主题偏好 */
export async function saveThemePreference(theme: ThemePreference): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(WEB_STORAGE_THEME_KEY, theme);
    return;
  }

  const store = getStore();
  await store.set(STORE_THEME_KEY, theme);

  const raw = await store.get<unknown>(STORE_CONFIG_KEY);
  if (raw && typeof raw === "object" && (raw as { schemaVersion?: number }).schemaVersion === 3) {
    const oldConfig = raw as AppConfigStoreV3;
    await store.set(STORE_CONFIG_KEY, {
      ...oldConfig,
      profile: {
        ...oldConfig.profile,
        theme,
      },
      meta: {
        ...oldConfig.meta,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  await store.save();
}

/** 清除所有配置 */
export async function clearConfig(): Promise<void> {
  localStorage.removeItem(WEB_STORAGE_CONFIG_KEY);
  localStorage.removeItem(WEB_STORAGE_THEME_KEY);
  localStorage.removeItem(DEVICE_ID_KEY);

  if (!isTauri()) return;

  const store = getStore();
  await store.delete(STORE_CONFIG_KEY);
  await store.delete(STORE_THEME_KEY);
  await store.save();
}
