/**
 * 应用状态管理 Hook
 * 管理全局配置状态和选中项状态（支持多平台）
 */

import { useState, useCallback, useEffect } from "react";
import type {
  AppConfig,
  AIConfig,
} from "../types/gitlab";
import type {
  PlatformType,
  PlatformOrg,
  PlatformRepo,
  PlatformReview,
  PlatformDiff,
} from "../types/platform";
import type { PlatformAdapter } from "../services/platform/types";
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveGitLabConfig,
  saveGitHubConfig,
  saveActivePlatform,
  saveAIConfig,
} from "../services/storage";
import { createPlatformAdapter } from "../services/platform/factory";

/** 应用状态 */
export interface AppState {
  /** 配置信息 */
  config: AppConfig;
  /** 当前活跃平台 */
  activePlatform: PlatformType;
  /** 当前活跃的平台适配器 */
  activeAdapter: PlatformAdapter | null;
  /** 平台连接状态 */
  isConnected: boolean;
  /** 连接中 */
  isConnecting: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前选中的组织/群组 */
  selectedOrg: PlatformOrg | null;
  /** 当前选中的仓库/项目 */
  selectedRepo: PlatformRepo | null;
  /** 当前选中的 MR/PR */
  selectedReview: PlatformReview | null;
  /** 当前选中的文件索引 */
  selectedFileIndex: number | null;
  /** 当前选中的文件 diff */
  selectedFileDiff: PlatformDiff | null;
}

/** 应用状态操作 */
export interface AppStateActions {
  /** 更新 GitLab 配置 */
  updateGitLabConfig: (url: string, token: string) => Promise<void>;
  /** 更新 GitHub 配置 */
  updateGitHubConfig: (url: string, token: string) => Promise<void>;
  /** 更新 AI 配置 */
  updateAIConfig: (config: AIConfig) => Promise<void>;
  /** 切换活跃平台 */
  switchPlatform: (platform: PlatformType) => Promise<void>;
  /** 选择组织/群组 */
  selectOrg: (org: PlatformOrg | null) => void;
  /** 选择仓库/项目 */
  selectRepo: (repo: PlatformRepo | null) => void;
  /** 选择 MR/PR */
  selectReview: (review: PlatformReview | null) => void;
  /** 选择文件 */
  selectFile: (index: number | null, diff: PlatformDiff | null) => void;
  /** 断开连接 */
  disconnect: () => void;
  /** 清除错误 */
  clearError: () => void;
}

/** 应用状态 Hook */
export function useAppState(): [AppState, AppStateActions] {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [activePlatform, setActivePlatformState] = useState<PlatformType>(DEFAULT_CONFIG.activePlatform);
  const [activeAdapter, setActiveAdapterState] = useState<PlatformAdapter | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<PlatformOrg | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<PlatformRepo | null>(null);
  const [selectedReview, setSelectedReview] = useState<PlatformReview | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [selectedFileDiff, setSelectedFileDiff] = useState<PlatformDiff | null>(null);

  // 初始化配置并尝试自动连接
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const loadedConfig = await loadConfig();
        if (cancelled) return;
        setConfig(loadedConfig);
        setActivePlatformState(loadedConfig.activePlatform);

        const platformConfig = loadedConfig.activePlatform === "github"
          ? loadedConfig.github
          : loadedConfig.gitlab;

        if (platformConfig.url && platformConfig.token) {
          const adapter = await createPlatformAdapter({
            type: loadedConfig.activePlatform,
            url: platformConfig.url,
            token: platformConfig.token,
          });
          setActiveAdapterState(adapter);
          setIsConnected(true);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载配置失败");
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  // 更新 GitLab 配置并尝试连接
  const updateGitLabConfig = useCallback(
    async (url: string, token: string) => {
      setIsConnecting(true);
      setError(null);

      try {
        // 创建适配器并验证连接
        const adapter = await createPlatformAdapter({
          type: "gitlab",
          url,
          token,
        });
        await adapter.getCurrentUser();
        setActiveAdapterState(adapter);

        // 保存配置
        const newConfig = { url, token };
        await saveGitLabConfig(newConfig);
        setConfig((prev) => ({ ...prev, gitlab: newConfig }));
        setActivePlatformState("gitlab");
        await saveActivePlatform("gitlab");
        setIsConnected(true);

        // 清空之前的选中状态
        setSelectedOrg(null);
        setSelectedRepo(null);
        setSelectedReview(null);
      } catch (e) {
        setActiveAdapterState(null);
        setIsConnected(false);
        setError(e instanceof Error ? e.message : "连接失败");
      } finally {
        setIsConnecting(false);
      }
    },
    [config]
  );

  // 更新 GitHub 配置并尝试连接
  const updateGitHubConfig = useCallback(
    async (url: string, token: string) => {
      setIsConnecting(true);
      setError(null);

      try {
        // 创建适配器并验证连接
        const adapter = await createPlatformAdapter({
          type: "github",
          url,
          token,
        });
        await adapter.getCurrentUser();
        setActiveAdapterState(adapter);

        // 保存配置
        const newConfig = { url, token };
        await saveGitHubConfig(newConfig);
        setConfig((prev) => ({ ...prev, github: newConfig }));
        setActivePlatformState("github");
        await saveActivePlatform("github");
        setIsConnected(true);

        // 清空之前的选中状态
        setSelectedOrg(null);
        setSelectedRepo(null);
        setSelectedReview(null);
      } catch (e) {
        setActiveAdapterState(null);
        setIsConnected(false);
        setError(e instanceof Error ? e.message : "连接失败");
      } finally {
        setIsConnecting(false);
      }
    },
    [config]
  );

  // 切换活跃平台
  const switchPlatform = useCallback(async (platform: PlatformType) => {
    // 如果已经是当前平台，不做处理
    if (platform === activePlatform) return;

    setIsConnecting(true);
    setError(null);

    try {
      const platformConfig = platform === "github"
        ? config.github
        : config.gitlab;

      if (!platformConfig.url || !platformConfig.token) {
        throw new Error(`请先配置 ${platform === "github" ? "GitHub" : "GitLab"} 连接信息`);
      }

      // 创建新平台适配器
      const adapter = await createPlatformAdapter({
        type: platform,
        url: platformConfig.url,
        token: platformConfig.token,
      });
      await adapter.getCurrentUser();
      setActiveAdapterState(adapter);

      setActivePlatformState(platform);
      await saveActivePlatform(platform);
      setIsConnected(true);

      // 清空选中状态
      setSelectedOrg(null);
      setSelectedRepo(null);
      setSelectedReview(null);
    } catch (e) {
      setActiveAdapterState(null);
      setIsConnected(false);
      setError(e instanceof Error ? e.message : "切换平台失败");
    } finally {
      setIsConnecting(false);
    }
  }, [activePlatform, config]);

  // 更新 AI 配置
  const updateAIConfig = useCallback(async (newAIConfig: AIConfig) => {
    await saveAIConfig(newAIConfig);
    setConfig((prev) => ({ ...prev, ai: newAIConfig }));
  }, []);

  // 选择组织/群组
  const selectOrg = useCallback((org: PlatformOrg | null) => {
    setSelectedOrg(org);
    setSelectedRepo(null);
    setSelectedReview(null);
  }, []);

  // 选择仓库/项目
  const selectRepo = useCallback((repo: PlatformRepo | null) => {
    setSelectedRepo(repo);
    setSelectedReview(null);
  }, []);

  // 选择 MR/PR
  const selectReview = useCallback((review: PlatformReview | null) => {
    setSelectedReview(review);
    // 清空文件选中状态
    setSelectedFileIndex(null);
    setSelectedFileDiff(null);
  }, []);

  // 选择文件
  const selectFile = useCallback(
    (index: number | null, diff: PlatformDiff | null) => {
      setSelectedFileIndex(index);
      setSelectedFileDiff(diff);
    },
    []
  );

  // 断开连接
  const disconnect = useCallback(() => {
    setActiveAdapterState(null);
    setIsConnected(false);
    setSelectedOrg(null);
    setSelectedRepo(null);
    setSelectedReview(null);
    setSelectedFileIndex(null);
    setSelectedFileDiff(null);
  }, []);

  // 清除错误
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const state: AppState = {
    config,
    activePlatform,
    activeAdapter,
    isConnected,
    isConnecting,
    error,
    selectedOrg,
    selectedRepo,
    selectedReview,
    selectedFileIndex,
    selectedFileDiff,
  };

  const actions: AppStateActions = {
    updateGitLabConfig,
    updateGitHubConfig,
    updateAIConfig,
    switchPlatform,
    selectOrg,
    selectRepo,
    selectReview,
    selectFile,
    disconnect,
    clearError,
  };

  return [state, actions];
}
