import { contextBridge, ipcRenderer } from "electron";
import { DESKTOP_CHANNELS } from "./channels";
import type { DesktopApi, DesktopSaveConfigPayload, ThemePreference } from "../src/types/desktop";

/**
 * 创建渲染进程可访问的桌面桥接对象
 */
function createDesktopApi(): DesktopApi {
  return {
    isDesktop: () => true,
    loadConfig: () => ipcRenderer.invoke(DESKTOP_CHANNELS.loadConfig),
    saveConfig: (payload: DesktopSaveConfigPayload) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.saveConfig, payload),
    clearConfig: () => ipcRenderer.invoke(DESKTOP_CHANNELS.clearConfig),
    setNativeTheme: (theme: ThemePreference) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.setNativeTheme, theme),
    setWindowBackground: (color: string) =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.setWindowBackground, color),
    tryImportLegacyConfig: () => ipcRenderer.invoke(DESKTOP_CHANNELS.tryImportLegacyConfig),
  };
}

contextBridge.exposeInMainWorld("desktop", createDesktopApi());
