/**
 * 平台客户端工厂
 * 根据配置创建对应平台的适配器实例，管理活跃实例生命周期
 */

import type { PlatformAdapter, PlatformConfig } from "./types";

/** 活跃的适配器实例 */
let activeAdapter: PlatformAdapter | null = null;

/**
 * 创建平台适配器实例
 * 延迟导入具体适配器模块，避免循环依赖
 */
export async function createPlatformAdapter(config: PlatformConfig): Promise<PlatformAdapter> {
  switch (config.type) {
    case "gitlab": {
      const { createGitLabAdapter } = await import("./gitlab-adapter");
      return createGitLabAdapter(config.url, config.token);
    }
    case "github": {
      const { createGitHubAdapter } = await import("./github-adapter");
      return createGitHubAdapter(config.url, config.token);
    }
    default:
      throw new Error(`不支持的平台类型: ${config.type}`);
  }
}

/** 设置活跃的适配器实例 */
export function setActiveAdapter(adapter: PlatformAdapter | null): void {
  activeAdapter = adapter;
}

/** 获取活跃的适配器实例 */
export function getActiveAdapter(): PlatformAdapter | null {
  return activeAdapter;
}

/** 获取活跃的适配器实例（非空断言） */
export function requireActiveAdapter(): PlatformAdapter {
  if (!activeAdapter) {
    throw new Error("平台客户端未初始化，请先配置并连接 Git 平台");
  }
  return activeAdapter;
}

/** 销毁活跃的适配器实例 */
export function destroyActiveAdapter(): void {
  activeAdapter = null;
}

/** 检查是否有活跃的适配器实例 */
export function hasActiveAdapter(): boolean {
  return activeAdapter !== null;
}
