/**
 * 配置存储服务
 * Electron 环境通过桌面桥接读写，浏览器环境使用 localStorage 回退
 */

import { getDesktopBridge } from "../desktop/bridge";
import { PRESET_PROVIDERS } from "../constants/preset-providers";
import type {
  DesktopLoadConfigResult,
  DesktopMigrationInfo,
  ThemePreference,
} from "../types/desktop";
import type {
  AppConfig,
  AIConfig,
  AIProviderList,
  GitLabConfig,
} from "../types/gitlab";

export type { ThemePreference } from "../types/desktop";

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

interface StoreFile {
  app_config: AppConfigStoreV3 | AppConfigStoreV2Legacy;
  theme?: ThemePreference;
  device_id?: string;
  migration?: DesktopMigrationInfo;
}

interface LegacyAIConfigShape {
  ProviderId?: string;
  ModelId?: string;
  ModeProviders?: AIProviderList;
}

const WEB_STORAGE_CONFIG_KEY = "code-reviewer-config";
const WEB_STORAGE_THEME_KEY = "theme";
const DEVICE_ID_KEY = "device-id";
const SECRET_KEY_NS = "com.nooldey.code-reviewer.v3";
const ENABLE_OPTIONAL_SECRET_ENCRYPTION = true;
const DEFAULT_MIGRATION: DesktopMigrationInfo = {
  imported: false,
  secretsNeedReset: false,
};

let lastDesktopLoadResult: DesktopLoadConfigResult | null = null;

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

/**
 * 创建默认配置副本
 */
function cloneDefaultConfig(): AppConfig {
  return {
    gitlab: { ...DEFAULT_CONFIG.gitlab },
    ai: {
      ...DEFAULT_CONFIG.ai,
      modeProviders: DEFAULT_CONFIG.ai.modeProviders.map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({ ...model })),
      })),
      rules: [...DEFAULT_CONFIG.ai.rules],
    },
  };
}

/**
 * 规范化模型供应商列表
 */
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

/**
 * 将输入配置与默认配置合并
 */
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

/**
 * 读取浏览器回退配置
 */
function readWebConfig(): Partial<AppConfig> | null {
  try {
    const stored = localStorage.getItem(WEB_STORAGE_CONFIG_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Partial<AppConfig>;
  } catch (error) {
    console.error("Failed to parse legacy config:", error);
    return null;
  }
}

/**
 * 将字节转为 Base64
 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 将 Base64 转为字节
 */
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 读取或生成浏览器回退环境的设备 ID
 */
function getBrowserDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

/**
 * 规范化主题值
 */
function normalizeTheme(value?: string): ThemePreference | undefined {
  return value === "dark" || value === "light" || value === "system" ? value : undefined;
}

/**
 * 为浏览器回退环境派生加密密钥
 */
async function deriveBrowserSecretKey(deviceId?: string): Promise<CryptoKey | null> {
  if (!ENABLE_OPTIONAL_SECRET_ENCRYPTION) return null;
  if (!globalThis.crypto?.subtle) return null;

  const raw = new TextEncoder().encode(
    `${SECRET_KEY_NS}:${deviceId ?? getBrowserDeviceId()}`
  );
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 为浏览器回退环境编码敏感字段
 */
async function encodeBrowserSecret(
  value: string,
  deviceId?: string
): Promise<StoredSecret | undefined> {
  if (!value) return undefined;

  try {
    const key = await deriveBrowserSecretKey(deviceId);
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
  } catch (error) {
    console.error("Secret encryption failed, fallback to plain:", error);
    return { mode: "plain", value };
  }
}

/**
 * 为浏览器回退环境解码敏感字段
 */
async function decodeBrowserSecret(
  secret?: StoredSecret,
  deviceId?: string
): Promise<string> {
  if (!secret?.value) return "";
  if (secret.mode === "plain") return secret.value;

  try {
    const key = await deriveBrowserSecretKey(deviceId);
    if (!key || !secret.iv) return "";
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(secret.iv) as BufferSource },
      key,
      fromBase64(secret.value) as BufferSource
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Secret decryption failed:", error);
    return "";
  }
}

/**
 * 将业务配置转换为浏览器回退存储结构
 */
async function toBrowserStoreConfig(
  config: AppConfig,
  theme?: ThemePreference,
  deviceId?: string
): Promise<AppConfigStoreV3> {
  const providerApiKeys: Record<string, StoredSecret> = {};
  const modeProviders = config.ai.modeProviders.map((provider) => ({
    ...provider,
    apiKey: "",
    models: provider.models,
  }));

  for (const provider of config.ai.modeProviders) {
    if (provider.apiKey) {
      const encodedProviderKey = await encodeBrowserSecret(provider.apiKey, deviceId);
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
      gitlabToken: await encodeBrowserSecret(config.gitlab.token, deviceId),
    },
    sync: {
      enabled: false,
      deviceId: deviceId ?? getBrowserDeviceId(),
      revision: 0,
      dirtyFields: [],
    },
    meta: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * 将浏览器回退的 V3 结构还原为业务配置
 */
async function fromBrowserStoreV3Config(
  storeConfig: AppConfigStoreV3,
  deviceId?: string
): Promise<AppConfig> {
  const providerApiKeyMap: Record<string, string> = {};
  if (storeConfig.secrets.providerApiKeys) {
    for (const [providerId, secret] of Object.entries(storeConfig.secrets.providerApiKeys)) {
      providerApiKeyMap[providerId] = await decodeBrowserSecret(secret, deviceId);
    }
  }

  const modeProviders = (storeConfig.profile.modeProviders ?? []).map((provider) => ({
    ...provider,
    id: provider.id,
    apiUrl: provider.apiUrl || "",
    apiKey: providerApiKeyMap[provider.id] || provider.apiKey || "",
    models: (provider.models || []).map((model) => ({
      ...model,
      id: model.id || model.name,
    })),
  }));

  return mergeWithDefault({
    gitlab: {
      url: storeConfig.profile.gitlabUrl,
      token: await decodeBrowserSecret(storeConfig.secrets.gitlabToken, deviceId),
    },
    ai: {
      providerId: storeConfig.profile.providerId,
      modelId: storeConfig.profile.modelId,
      modeProviders,
      language: storeConfig.profile.language,
      rules: storeConfig.profile.rules ?? [],
    },
  });
}

/**
 * 将浏览器回退的 V2 结构还原为业务配置
 */
function fromBrowserStoreV2Config(storeConfig: AppConfigStoreV2Legacy): AppConfig {
  return mergeWithDefault({
    gitlab: { url: storeConfig.profile.gitlabUrl, token: "" },
    ai: {
      providerId: "legacy-provider",
      modelId: storeConfig.profile.modelName,
      modeProviders: [
        {
          name: "兼容迁移供应商",
          id: "legacy-provider",
          apiUrl: storeConfig.profile.apiUrl,
          apiKey: "",
          models: [{ name: storeConfig.profile.modelName, id: storeConfig.profile.modelName }],
        },
      ],
      language: storeConfig.profile.language,
      rules: storeConfig.profile.rules ?? [],
    },
  });
}

/**
 * 读取桌面桥接返回的完整配置
 */
async function loadFromDesktop(): Promise<DesktopLoadConfigResult> {
  const desktop = getDesktopBridge();
  if (!desktop) {
    return {
      config: mergeWithDefault(readWebConfig()),
      theme: normalizeTheme(localStorage.getItem(WEB_STORAGE_THEME_KEY) ?? undefined),
      migration: DEFAULT_MIGRATION,
    };
  }

  const result = await desktop.loadConfig();
  lastDesktopLoadResult = result;
  return result;
}

/**
 * 读取浏览器回退环境的完整配置
 */
async function loadFromBrowser(): Promise<DesktopLoadConfigResult> {
  const raw = readWebConfig();
  const maybeV3 = raw as Partial<AppConfigStoreV3> | null;

  if (maybeV3?.schemaVersion === 3 && "profile" in maybeV3 && "secrets" in maybeV3) {
    return {
      config: await fromBrowserStoreV3Config(maybeV3 as AppConfigStoreV3),
      theme: normalizeTheme((maybeV3 as AppConfigStoreV3).profile.theme),
      migration: DEFAULT_MIGRATION,
    };
  }

  if ((raw as Partial<AppConfigStoreV2Legacy> | null)?.schemaVersion === 2) {
    const config = fromBrowserStoreV2Config(raw as AppConfigStoreV2Legacy);
    return {
      config,
      theme: normalizeTheme((raw as AppConfigStoreV2Legacy).profile.theme),
      migration: DEFAULT_MIGRATION,
    };
  }

  return {
    config: mergeWithDefault(raw),
    theme: normalizeTheme(localStorage.getItem(WEB_STORAGE_THEME_KEY) ?? undefined),
    migration: DEFAULT_MIGRATION,
  };
}

/**
 * 获取最近一次加载的迁移状态
 */
export function getLastMigrationInfo(): DesktopMigrationInfo {
  return lastDesktopLoadResult?.migration ?? DEFAULT_MIGRATION;
}

/** 加载完整配置 */
export async function loadConfig(): Promise<AppConfig> {
  const desktop = getDesktopBridge();
  const result = desktop ? await loadFromDesktop() : await loadFromBrowser();
  return mergeWithDefault(result.config);
}

/** 保存完整配置 */
export async function saveConfig(config: AppConfig): Promise<void> {
  const desktop = getDesktopBridge();
  const theme = await loadThemePreference();

  if (!desktop) {
    const browserConfig = await toBrowserStoreConfig(config, theme);
    localStorage.setItem(WEB_STORAGE_CONFIG_KEY, JSON.stringify(browserConfig));
    return;
  }

  await desktop.saveConfig({
    config,
    theme,
    clearMigration: true,
  });
  lastDesktopLoadResult = {
    config,
    theme,
    migration: DEFAULT_MIGRATION,
  };
}

function assertIsObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`配置字段 ${name} 必须为对象`);
  }
  return value as Record<string, unknown>;
}

function isStoreFile(value: unknown): value is StoreFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    "app_config" in candidate &&
    typeof candidate.app_config === "object" &&
    candidate.app_config !== null &&
    "schemaVersion" in (candidate.app_config as Record<string, unknown>)
  );
}

function isAppConfigStoreV3(value: unknown): value is AppConfigStoreV3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 3 && typeof candidate.profile === "object" && candidate.profile !== null;
}

async function parseStoreFile(value: StoreFile): Promise<AppConfig> {
  if (isAppConfigStoreV3(value.app_config)) {
    return fromBrowserStoreV3Config(value.app_config, value.device_id);
  }

  return fromBrowserStoreV2Config(value.app_config as AppConfigStoreV2Legacy);
}

async function parseImportPayload(payload: unknown): Promise<AppConfig> {
  const raw = typeof payload === "string" ? JSON.parse(payload) : payload;
  const object = assertIsObject(raw, "root");

  if (isStoreFile(object)) {
    return parseStoreFile(object);
  }

  if (!("gitlab" in object) && !("ai" in object)) {
    throw new Error("配置文件必须包含 gitlab 或 ai 字段");
  }

  if ("gitlab" in object && object.gitlab !== undefined) {
    assertIsObject(object.gitlab, "gitlab");
  }

  if ("ai" in object && object.ai !== undefined) {
    assertIsObject(object.ai, "ai");
  }

  return mergeWithDefault(object as Partial<AppConfig>);
}

async function createExportStoreFile(): Promise<StoreFile> {
  const config = await loadConfig();
  const theme = await loadThemePreference();
  const deviceId = getBrowserDeviceId();
  const browserStoreConfig = await toBrowserStoreConfig(config, theme, deviceId);

  return {
    app_config: browserStoreConfig,
    theme,
    device_id: deviceId,
  };
}

/** 导出当前配置为 JSON 字符串 */
export async function exportConfig(): Promise<string> {
  const storeFile = await createExportStoreFile();
  return JSON.stringify(storeFile, null, 2);
}

/** 从 JSON 导入配置 */
export async function importConfig(payload: string | unknown): Promise<AppConfig> {
  const config = await parseImportPayload(payload);
  await saveConfig(config);
  return config;
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
  const desktop = getDesktopBridge();
  if (!desktop) {
    return normalizeTheme(localStorage.getItem(WEB_STORAGE_THEME_KEY) ?? undefined);
  }

  if (lastDesktopLoadResult) {
    return lastDesktopLoadResult.theme;
  }

  const result = await loadFromDesktop();
  return result.theme;
}

/** 保存主题偏好 */
export async function saveThemePreference(theme: ThemePreference): Promise<void> {
  const desktop = getDesktopBridge();
  if (!desktop) {
    localStorage.setItem(WEB_STORAGE_THEME_KEY, theme);
    return;
  }

  const current = lastDesktopLoadResult ?? (await desktop.loadConfig());
  await desktop.saveConfig({
    config: current.config,
    theme,
    clearMigration: true,
  });
  lastDesktopLoadResult = {
    ...current,
    theme,
    migration: DEFAULT_MIGRATION,
  };
}

/** 清除所有配置 */
export async function clearConfig(): Promise<void> {
  const desktop = getDesktopBridge();
  localStorage.removeItem(WEB_STORAGE_CONFIG_KEY);
  localStorage.removeItem(WEB_STORAGE_THEME_KEY);
  localStorage.removeItem(DEVICE_ID_KEY);

  if (!desktop) return;

  await desktop.clearConfig();
  lastDesktopLoadResult = null;
}
