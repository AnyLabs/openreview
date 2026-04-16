import type { DesktopApi } from "../types/desktop";

/**
 * 获取当前可用的桌面桥接对象
 */
export function getDesktopBridge(): DesktopApi | null {
  if (typeof window === "undefined") {
    return null;
  }

  const bridge = window.desktop;
  if (!bridge?.isDesktop()) {
    return null;
  }

  return bridge;
}

/**
 * 判断当前是否运行在桌面壳中
 */
export function isDesktopRuntime(): boolean {
  return getDesktopBridge() !== null;
}
