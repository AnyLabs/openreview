import type { AppConfig } from "./gitlab";

/** 主题偏好 */
export type ThemePreference = "dark" | "light" | "system";

/** 桌面端迁移信息 */
export interface DesktopMigrationInfo {
  /** 是否执行过旧配置导入 */
  imported: boolean;
  /** 是否需要用户重新填写敏感凭证 */
  secretsNeedReset: boolean;
  /** 迁移来源描述 */
  source?: string;
}

/** 桌面端加载配置结果 */
export interface DesktopLoadConfigResult {
  /** 业务配置 */
  config: AppConfig;
  /** 当前主题 */
  theme?: ThemePreference;
  /** 迁移状态 */
  migration: DesktopMigrationInfo;
}

/** 桌面端保存配置入参 */
export interface DesktopSaveConfigPayload {
  /** 业务配置 */
  config: AppConfig;
  /** 当前主题 */
  theme?: ThemePreference;
  /** 保存时是否清空迁移标记 */
  clearMigration?: boolean;
}

/** 渲染进程可访问的桌面能力 */
export interface DesktopApi {
  /** 当前运行时是否为桌面壳 */
  isDesktop: () => boolean;
  /** 加载完整配置 */
  loadConfig: () => Promise<DesktopLoadConfigResult>;
  /** 保存完整配置 */
  saveConfig: (payload: DesktopSaveConfigPayload) => Promise<void>;
  /** 清除配置 */
  clearConfig: () => Promise<void>;
  /** 同步原生主题 */
  setNativeTheme: (theme: ThemePreference) => Promise<void>;
  /** 同步窗口背景色 */
  setWindowBackground: (color: string) => Promise<void>;
  /** 手动尝试导入旧 Tauri 配置 */
  tryImportLegacyConfig: () => Promise<DesktopLoadConfigResult | null>;
}

declare global {
  interface Window {
    /** Electron 预加载暴露的桌面桥接对象 */
    desktop?: DesktopApi;
  }
}

export {};
