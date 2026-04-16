/** Electron IPC 通道名 */
export const DESKTOP_CHANNELS = {
  loadConfig: "desktop:load-config",
  saveConfig: "desktop:save-config",
  clearConfig: "desktop:clear-config",
  setNativeTheme: "desktop:set-native-theme",
  setWindowBackground: "desktop:set-window-background",
  tryImportLegacyConfig: "desktop:try-import-legacy-config",
} as const;
