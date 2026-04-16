import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { DESKTOP_CHANNELS } from "./channels";
import {
  clearDesktopState,
  loadDesktopState,
  saveDesktopState,
  tryImportLegacyConfig,
} from "./storage";
import type { DesktopSaveConfigPayload, ThemePreference } from "../src/types/desktop";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEV_SERVER_URL = "http://127.0.0.1:1420";

let mainWindow: BrowserWindow | null = null;

/**
 * 获取渲染进程入口地址
 */
function getRendererEntry(): string {
  return app.isPackaged ? path.join(__dirname, "../dist/index.html") : DEV_SERVER_URL;
}

/**
 * 获取本地构建后的渲染进程入口文件路径。
 */
function getRendererFallbackFile(): string {
  return path.join(__dirname, "../dist/index.html");
}

/**
 * 检查本地 Vite 开发服务器是否可用。
 */
async function isDevServerAvailable(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 1000);

  try {
    const response = await fetch(DEV_SERVER_URL, {
      method: "HEAD",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * 创建主窗口
 */
async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#0d1018",
    title: "Open Reviewer",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    titleBarOverlay:
      process.platform === "win32"
        ? {
            color: "#0d1018",
            symbolColor: "#ffffff",
            height: 36,
          }
        : false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (app.isPackaged) {
    await win.loadFile(getRendererEntry());
  } else {
    if (await isDevServerAvailable()) {
      await win.loadURL(getRendererEntry());
    } else {
      await win.loadFile(getRendererFallbackFile());
    }
  }

  return win;
}

/**
 * 同步原生主题来源
 */
function applyNativeTheme(theme: ThemePreference): void {
  nativeTheme.themeSource = theme === "system" ? "system" : theme;
}

/**
 * 注册桌面能力 IPC
 */
function registerDesktopIpc(): void {
  ipcMain.handle(DESKTOP_CHANNELS.loadConfig, async () => loadDesktopState());
  ipcMain.handle(
    DESKTOP_CHANNELS.saveConfig,
    async (_event, payload: DesktopSaveConfigPayload) => saveDesktopState(payload)
  );
  ipcMain.handle(DESKTOP_CHANNELS.clearConfig, async () => clearDesktopState());
  ipcMain.handle(DESKTOP_CHANNELS.tryImportLegacyConfig, async () => tryImportLegacyConfig());
  ipcMain.handle(DESKTOP_CHANNELS.setNativeTheme, async (_event, theme: ThemePreference) => {
    applyNativeTheme(theme);
  });
  ipcMain.handle(DESKTOP_CHANNELS.setWindowBackground, async (_event, color: string) => {
    mainWindow?.setBackgroundColor(color);
  });
}

/**
 * 启动 Electron 应用
 */
async function bootstrap(): Promise<void> {
  await app.whenReady();
  registerDesktopIpc();
  mainWindow = await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

void bootstrap();
