/**
 * 应用状态管理 Hook
 * 管理全局配置状态和选中项状态
 */

import { useState, useCallback, useEffect } from "react";
import type {
  AppConfig,
  AIConfig,
  GitLabGroup,
  GitLabProject,
  GitLabMergeRequest,
  GitLabDiff,
} from "../types/gitlab";
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveGitLabConfig,
  saveAIConfig,
} from "../services/storage";
import { initGitLabClient, destroyGitLabClient } from "../services/gitlab";

/** 应用状态 */
export interface AppState {
  /** 配置信息 */
  config: AppConfig;
  /** GitLab 连接状态 */
  isConnected: boolean;
  /** 连接中 */
  isConnecting: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前选中的群组 */
  selectedGroup: GitLabGroup | null;
  /** 当前选中的项目 */
  selectedProject: GitLabProject | null;
  /** 当前选中的 MR */
  selectedMR: GitLabMergeRequest | null;
  /** 当前选中的文件索引 */
  selectedFileIndex: number | null;
  /** 当前选中的文件 diff */
  selectedFileDiff: GitLabDiff | null;
}

/** 应用状态操作 */
export interface AppStateActions {
  /** 更新 GitLab 配置 */
  updateGitLabConfig: (url: string, token: string) => Promise<void>;
  /** 更新 AI 配置 */
  updateAIConfig: (config: AIConfig) => Promise<void>;
  /** 选择群组 */
  selectGroup: (group: GitLabGroup | null) => void;
  /** 选择项目 */
  selectProject: (project: GitLabProject | null) => void;
  /** 选择 MR */
  selectMR: (mr: GitLabMergeRequest | null) => void;
  /** 选择文件 */
  selectFile: (index: number | null, diff: GitLabDiff | null) => void;
  /** 断开连接 */
  disconnect: () => void;
  /** 清除错误 */
  clearError: () => void;
}

/** 应用状态 Hook */
export function useAppState(): [AppState, AppStateActions] {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GitLabGroup | null>(null);
  const [selectedProject, setSelectedProject] = useState<GitLabProject | null>(
    null
  );
  const [selectedMR, setSelectedMR] = useState<GitLabMergeRequest | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null
  );
  const [selectedFileDiff, setSelectedFileDiff] = useState<GitLabDiff | null>(
    null
  );

  // 初始化配置并尝试自动连接
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const loadedConfig = await loadConfig();
        if (cancelled) return;
        setConfig(loadedConfig);

        const { gitlab } = loadedConfig;
        if (gitlab.url && gitlab.token) {
          initGitLabClient(gitlab.url, gitlab.token);
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
        // 初始化客户端
        initGitLabClient(url, token);

        // 验证连接（获取当前用户）
        const { getGitLabClient } = await import("../services/gitlab");
        await getGitLabClient().getCurrentUser();

        // 保存配置
        const newConfig = { ...config.gitlab, url, token };
        await saveGitLabConfig(newConfig);
        setConfig((prev) => ({ ...prev, gitlab: newConfig }));
        setIsConnected(true);

        // 清空之前的选中状态
        setSelectedGroup(null);
        setSelectedProject(null);
        setSelectedMR(null);
      } catch (e) {
        destroyGitLabClient();
        setIsConnected(false);
        setError(e instanceof Error ? e.message : "连接失败");
      } finally {
        setIsConnecting(false);
      }
    },
    [config]
  );

  // 更新 AI 配置
  const updateAIConfig = useCallback(async (newAIConfig: AIConfig) => {
    await saveAIConfig(newAIConfig);
    setConfig((prev) => ({ ...prev, ai: newAIConfig }));
  }, []);

  // 选择群组
  const selectGroup = useCallback((group: GitLabGroup | null) => {
    setSelectedGroup(group);
    setSelectedProject(null);
    setSelectedMR(null);
  }, []);

  // 选择项目
  const selectProject = useCallback((project: GitLabProject | null) => {
    setSelectedProject(project);
    setSelectedMR(null);
  }, []);

  // 选择 MR
  const selectMR = useCallback((mr: GitLabMergeRequest | null) => {
    setSelectedMR(mr);
    // 清空文件选中状态
    setSelectedFileIndex(null);
    setSelectedFileDiff(null);
  }, []);

  // 选择文件
  const selectFile = useCallback(
    (index: number | null, diff: GitLabDiff | null) => {
      setSelectedFileIndex(index);
      setSelectedFileDiff(diff);
    },
    []
  );

  // 断开连接
  const disconnect = useCallback(() => {
    destroyGitLabClient();
    setIsConnected(false);
    setSelectedGroup(null);
    setSelectedProject(null);
    setSelectedMR(null);
    setSelectedFileIndex(null);
    setSelectedFileDiff(null);
  }, []);

  // 清除错误
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const state: AppState = {
    config,
    isConnected,
    isConnecting,
    error,
    selectedGroup,
    selectedProject,
    selectedMR,
    selectedFileIndex,
    selectedFileDiff,
  };

  const actions: AppStateActions = {
    updateGitLabConfig,
    updateAIConfig,
    selectGroup,
    selectProject,
    selectMR,
    selectFile,
    disconnect,
    clearError,
  };

  return [state, actions];
}
