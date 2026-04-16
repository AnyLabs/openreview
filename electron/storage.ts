import { webcrypto } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { PRESET_PROVIDERS } from "../src/constants/preset-providers";
import type { AppConfig, AIConfig, AIProviderList, GitLabConfig } from "../src/types/gitlab";
import type {
  DesktopLoadConfigResult,
  DesktopMigrationInfo,
  DesktopSaveConfigPayload,
  ThemePreference,
} from "../src/types/desktop";

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

interface ElectronStoreFile {
  app_config?: AppConfigStoreV3 | AppConfigStoreV2Legacy;
  theme?: ThemePreference;
  device_id?: string;
  migration?: DesktopMigrationInfo;
}

interface LegacyImportOutcome {
  result: DesktopLoadConfigResult;
  storeFile: ElectronStoreFile;
}

const SECRET_KEY_NS = "com.nooldey.code-reviewer.v3";
const STORE_FILE_NAME = "settings.json";
const MAX_SCAN_DEPTH = 5;
const MAX_SCAN_FILE_SIZE = 4 * 1024 * 1024;
const DEFAULT_MIGRATION: DesktopMigrationInfo = {
  imported: false,
  secretsNeedReset: false,
};

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
 * 创建默认配置的深拷贝
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

interface LegacyAIConfigShape {
  ProviderId?: string;
  ModelId?: string;
  ModeProviders?: AIProviderList;
}

/**
 * 规范化供应商配置结构
 */
function normalizeModeProviders(modeProviders: AIProviderList): AIProviderList {
  return (modeProviders || []).map((provider) => ({
    ...provider,
    id: provider.id,
    apiUrl: provider.apiUrl || "",
    apiKey: provider.apiKey || "",
    models: (provider.models || []).map((model) => ({
      ...model,
      id: model.id,
    })),
  }));
}

/**
 * 将输入配置与默认值合并
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
    rules: aiInput.rules ?? DEFAULT_CONFIG.ai.rules,
  };

  return {
    gitlab: { ...DEFAULT_CONFIG.gitlab, ...config.gitlab },
    ai: normalizedAI,
  };
}

/**
 * 读取 Electron 当前配置文件路径
 */
function getStoreFilePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE_NAME);
}

/**
 * 将字节转为 Base64
 */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/**
 * 将 Base64 转为字节
 */
function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

/**
 * 读取当前 Electron 配置文件
 */
async function readStoreFile(): Promise<ElectronStoreFile> {
  try {
    const raw = await fs.readFile(getStoreFilePath(), "utf8");
    return JSON.parse(raw) as ElectronStoreFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

/**
 * 持久化当前 Electron 配置文件
 */
async function writeStoreFile(storeFile: ElectronStoreFile): Promise<void> {
  await fs.mkdir(path.dirname(getStoreFilePath()), { recursive: true });
  await fs.writeFile(getStoreFilePath(), JSON.stringify(storeFile, null, 2), "utf8");
}

/**
 * 读取或生成当前设备 ID
 */
async function getOrCreateDeviceId(storeFile?: ElectronStoreFile): Promise<string> {
  const currentStoreFile = storeFile ?? (await readStoreFile());
  if (currentStoreFile.device_id) {
    return currentStoreFile.device_id;
  }

  const deviceId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  currentStoreFile.device_id = deviceId;
  await writeStoreFile(currentStoreFile);
  return deviceId;
}

/**
 * 根据设备 ID 派生 AES-GCM 密钥
 */
async function deriveSecretKey(deviceId: string): Promise<webcrypto.CryptoKey> {
  const raw = new TextEncoder().encode(`${SECRET_KEY_NS}:${deviceId}`);
  const digest = await webcrypto.subtle.digest("SHA-256", raw);
  return webcrypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 使用指定设备 ID 编码敏感值
 */
async function encodeSecret(value: string, deviceId: string): Promise<StoredSecret | undefined> {
  if (!value) return undefined;

  const key = await deriveSecretKey(deviceId);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value)
  );
  return {
    mode: "enc",
    value: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  };
}

/**
 * 使用指定设备 ID 解码敏感值
 */
async function decodeSecret(secret: StoredSecret | undefined, deviceId?: string): Promise<string> {
  if (!secret?.value) return "";
  if (secret.mode === "plain") return secret.value;
  if (!deviceId || !secret.iv) return "";

  try {
    const key = await deriveSecretKey(deviceId);
    const decrypted = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(secret.iv) },
      key,
      fromBase64(secret.value)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

/**
 * 将业务配置转换为持久化结构
 */
async function toStoreConfig(
  config: AppConfig,
  theme: ThemePreference | undefined,
  deviceId: string
): Promise<AppConfigStoreV3> {
  const providerApiKeys: Record<string, StoredSecret> = {};
  const modeProviders = config.ai.modeProviders.map((provider) => ({
    ...provider,
    apiKey: "",
    models: provider.models.map((model) => ({ ...model })),
  }));

  for (const provider of config.ai.modeProviders) {
    if (!provider.apiKey) continue;
    const encoded = await encodeSecret(provider.apiKey, deviceId);
    if (encoded) {
      providerApiKeys[provider.id] = encoded;
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
      gitlabToken: await encodeSecret(config.gitlab.token, deviceId),
    },
    sync: {
      enabled: false,
      deviceId,
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
 * 将 V3 存储结构还原为业务配置
 */
async function fromStoreV3Config(
  storeConfig: AppConfigStoreV3,
  deviceId?: string
): Promise<AppConfig> {
  const providerApiKeyMap: Record<string, string> = {};
  if (storeConfig.secrets.providerApiKeys) {
    for (const [providerId, secret] of Object.entries(storeConfig.secrets.providerApiKeys)) {
      providerApiKeyMap[providerId] = await decodeSecret(secret, deviceId);
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
      token: await decodeSecret(storeConfig.secrets.gitlabToken, deviceId),
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
 * 将 V2 旧结构还原为业务配置
 */
function fromStoreV2Config(storeConfig: AppConfigStoreV2Legacy): AppConfig {
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
 * 从当前 Electron 配置文件中读取完整配置
 */
export async function loadDesktopState(): Promise<DesktopLoadConfigResult> {
  const storeFile = await readStoreFile();
  if (storeFile.app_config) {
    const appConfig = storeFile.app_config;
    const config =
      appConfig.schemaVersion === 3
        ? await fromStoreV3Config(appConfig, storeFile.device_id)
        : fromStoreV2Config(appConfig as AppConfigStoreV2Legacy);

    return {
      config,
      theme:
        appConfig.schemaVersion === 3
          ? appConfig.profile.theme ?? storeFile.theme
          : (appConfig as AppConfigStoreV2Legacy).profile.theme ?? storeFile.theme,
      migration: storeFile.migration ?? DEFAULT_MIGRATION,
    };
  }

  const imported = await tryImportLegacyConfig();
  if (imported) {
    return imported;
  }

  return {
    config: cloneDefaultConfig(),
    theme: storeFile.theme,
    migration: storeFile.migration ?? DEFAULT_MIGRATION,
  };
}

/**
 * 保存完整配置到 Electron 配置文件
 */
export async function saveDesktopState(payload: DesktopSaveConfigPayload): Promise<void> {
  const storeFile = await readStoreFile();
  const deviceId = await getOrCreateDeviceId(storeFile);
  const appConfig = await toStoreConfig(payload.config, payload.theme, deviceId);
  await writeStoreFile({
    ...storeFile,
    device_id: deviceId,
    theme: payload.theme,
    app_config: appConfig,
    migration: payload.clearMigration ? DEFAULT_MIGRATION : storeFile.migration ?? DEFAULT_MIGRATION,
  });
}

/**
 * 清空当前 Electron 配置文件
 */
export async function clearDesktopState(): Promise<void> {
  const filePath = getStoreFilePath();
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * 构造旧 Tauri 配置文件候选路径
 */
function buildLegacyStoreCandidates(): string[] {
  const appData = app.getPath("appData");
  const home = app.getPath("home");
  const localAppData = process.env.LOCALAPPDATA;
  const appDataEnv = process.env.APPDATA;

  const candidates = new Set<string>([
    path.join(appData, "com.nooldey.code-reviewer", STORE_FILE_NAME),
    path.join(appData, "Open Reviewer", STORE_FILE_NAME),
    path.join(home, "Library", "Application Support", "com.nooldey.code-reviewer", STORE_FILE_NAME),
    path.join(home, "Library", "Application Support", "Open Reviewer", STORE_FILE_NAME),
  ]);

  if (localAppData) {
    candidates.add(path.join(localAppData, "com.nooldey.code-reviewer", STORE_FILE_NAME));
    candidates.add(path.join(localAppData, "Open Reviewer", STORE_FILE_NAME));
  }
  if (appDataEnv) {
    candidates.add(path.join(appDataEnv, "com.nooldey.code-reviewer", STORE_FILE_NAME));
    candidates.add(path.join(appDataEnv, "Open Reviewer", STORE_FILE_NAME));
  }

  return [...candidates];
}

/**
 * 构造旧 Tauri 本地存储扫描根目录
 */
function buildLegacyDeviceIdRoots(): string[] {
  const appData = app.getPath("appData");
  const home = app.getPath("home");
  const localAppData = process.env.LOCALAPPDATA;
  const roots = new Set<string>([
    path.join(appData, "com.nooldey.code-reviewer"),
    path.join(appData, "Open Reviewer"),
    path.join(home, "Library", "Application Support", "com.nooldey.code-reviewer"),
    path.join(home, "Library", "Application Support", "Open Reviewer"),
  ]);

  if (localAppData) {
    roots.add(path.join(localAppData, "com.nooldey.code-reviewer"));
    roots.add(path.join(localAppData, "Open Reviewer"));
  }

  return [...roots];
}

/**
 * 从文本内容中提取旧 device-id
 */
function extractDeviceIdFromText(content: string): string | null {
  const patterns = [
    /device-id[^a-z0-9]+([0-9]{10,}-[a-z0-9]{8})/i,
    /"device-id"[^a-z0-9]+([0-9]{10,}-[a-z0-9]{8})/i,
    /device-id["':=,\s]+([0-9]{10,}-[a-z0-9]{8})/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * 递归扫描目录，尽量提取旧 device-id
 */
async function scanDirectoryForDeviceId(root: string, depth = 0): Promise<string | null> {
  if (depth > MAX_SCAN_DEPTH) return null;

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        const nested = await scanDirectoryForDeviceId(fullPath, depth + 1);
        if (nested) return nested;
        continue;
      }

      const lowerName = entry.name.toLowerCase();
      const maybeStorageFile =
        lowerName.endsWith(".json") ||
        lowerName.endsWith(".txt") ||
        lowerName.endsWith(".log") ||
        lowerName.endsWith(".ldb") ||
        lowerName.endsWith(".localstorage") ||
        lowerName.endsWith(".sqlite");

      if (!maybeStorageFile) {
        continue;
      }

      const stat = await fs.stat(fullPath);
      if (stat.size > MAX_SCAN_FILE_SIZE) {
        continue;
      }

      const content = await fs.readFile(fullPath, "latin1");
      const deviceId = extractDeviceIdFromText(content);
      if (deviceId) {
        return deviceId;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 尝试从旧 Tauri 本地数据中恢复 device-id
 */
async function readLegacyDeviceId(): Promise<string | null> {
  const roots = buildLegacyDeviceIdRoots();
  for (const root of roots) {
    const deviceId = await scanDirectoryForDeviceId(root);
    if (deviceId) {
      return deviceId;
    }
  }
  return null;
}

/**
 * 读取第一个存在的旧 Tauri 配置文件
 */
async function readFirstLegacyStore(): Promise<{ filePath: string; store: ElectronStoreFile } | null> {
  const candidates = buildLegacyStoreCandidates();
  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return {
        filePath,
        store: JSON.parse(raw) as ElectronStoreFile,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 对旧配置中的敏感字段执行兼容迁移
 */
async function migrateLegacySecrets(
  storeConfig: AppConfigStoreV3,
  legacyDeviceId: string | null
): Promise<{ gitlab: GitLabConfig; ai: AIConfig; secretsNeedReset: boolean }> {
  let secretsNeedReset = false;
  const gitlabToken = await decodeSecret(storeConfig.secrets.gitlabToken, legacyDeviceId ?? undefined);
  if (storeConfig.secrets.gitlabToken?.mode === "enc" && !gitlabToken) {
    secretsNeedReset = true;
  }

  const modeProviders = await Promise.all(
    (storeConfig.profile.modeProviders ?? []).map(async (provider) => {
      const encodedSecret = storeConfig.secrets.providerApiKeys?.[provider.id];
      const apiKey = await decodeSecret(encodedSecret, legacyDeviceId ?? undefined);
      if (encodedSecret?.mode === "enc" && !apiKey) {
        secretsNeedReset = true;
      }

      return {
        ...provider,
        apiUrl: provider.apiUrl || "",
        apiKey,
        models: (provider.models || []).map((model) => ({
          ...model,
          id: model.id || model.name,
        })),
      };
    })
  );

  return {
    gitlab: {
      url: storeConfig.profile.gitlabUrl,
      token: gitlabToken,
    },
    ai: {
      providerId: storeConfig.profile.providerId,
      modelId: storeConfig.profile.modelId,
      modeProviders,
      language: storeConfig.profile.language,
      rules: storeConfig.profile.rules ?? [],
    },
    secretsNeedReset,
  };
}

/**
 * 将旧 Tauri 配置导入当前 Electron 配置
 */
async function importLegacyStore(): Promise<LegacyImportOutcome | null> {
  const legacy = await readFirstLegacyStore();
  if (!legacy?.store.app_config) {
    return null;
  }

  const currentStoreFile = await readStoreFile();
  const currentDeviceId = await getOrCreateDeviceId(currentStoreFile);

  const appConfig = legacy.store.app_config;
  let config: AppConfig;
  let theme: ThemePreference | undefined;
  let secretsNeedReset = false;

  if (appConfig.schemaVersion === 3) {
    const legacyDeviceId = await readLegacyDeviceId();
    const migrated = await migrateLegacySecrets(appConfig, legacyDeviceId);
    config = mergeWithDefault({
      gitlab: migrated.gitlab,
      ai: migrated.ai,
    });
    theme = appConfig.profile.theme ?? legacy.store.theme;
    secretsNeedReset = migrated.secretsNeedReset;
  } else {
    config = fromStoreV2Config(appConfig as AppConfigStoreV2Legacy);
    theme = (appConfig as AppConfigStoreV2Legacy).profile.theme ?? legacy.store.theme;
  }

  if (secretsNeedReset) {
    config = {
      ...config,
      gitlab: {
        ...config.gitlab,
        token: "",
      },
      ai: {
        ...config.ai,
        modeProviders: config.ai.modeProviders.map((provider) => ({
          ...provider,
          apiKey: "",
          models: provider.models.map((model) => ({ ...model })),
        })),
      },
    };
  }

  const savedConfig = await toStoreConfig(config, theme, currentDeviceId);
  const migration: DesktopMigrationInfo = {
    imported: true,
    secretsNeedReset,
    source: legacy.filePath,
  };
  const storeFile: ElectronStoreFile = {
    ...currentStoreFile,
    device_id: currentDeviceId,
    theme,
    app_config: savedConfig,
    migration,
  };

  await writeStoreFile(storeFile);
  return {
    result: {
      config,
      theme,
      migration,
    },
    storeFile,
  };
}

/**
 * 主动触发旧 Tauri 配置导入
 */
export async function tryImportLegacyConfig(): Promise<DesktopLoadConfigResult | null> {
  const currentStoreFile = await readStoreFile();
  if (currentStoreFile.app_config) {
    return null;
  }

  const imported = await importLegacyStore();
  return imported?.result ?? null;
}
