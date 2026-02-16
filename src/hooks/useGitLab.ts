/**
 * GitLab 数据获取 Hooks
 */

import { useState, useEffect, useCallback } from "react";
import type {
  GitLabGroup,
  GitLabProject,
  GitLabMergeRequest,
  GitLabMergeRequestWithChanges,
  GitLabMergeRequestMergeOptions,
  MRState,
} from "../types/gitlab";
import { getGitLabClient, isGitLabClientInitialized } from "../services/gitlab";

/** 群组列表 Hook */
export function useGroups() {
  const [groups, setGroups] = useState<GitLabGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!isGitLabClientInitialized()) {
      setGroups([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getGitLabClient().getGroups();
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取群组列表失败");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { groups, loading, error, fetchGroups };
}

/** 项目列表 Hook */
export function useProjects(groupId?: number | string) {
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!isGitLabClientInitialized()) {
      setProjects([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getGitLabClient();
      const data = groupId
        ? await client.getGroupProjects(groupId)
        : await client.getProjects();
      setProjects(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取项目列表失败");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, fetchProjects };
}

/** MR 列表 Hook */
export function useMergeRequests(
  projectId?: number,
  state: MRState = "opened"
) {
  const [mergeRequests, setMergeRequests] = useState<GitLabMergeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMergeRequests = useCallback(async () => {
    if (!isGitLabClientInitialized() || !projectId) {
      setMergeRequests([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getGitLabClient().getMergeRequests(projectId, state);
      setMergeRequests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取 MR 列表失败");
      setMergeRequests([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, state]);

  useEffect(() => {
    fetchMergeRequests();
  }, [fetchMergeRequests]);

  return { mergeRequests, loading, error, fetchMergeRequests };
}

/** MR 详情（含变更）Hook */
export function useMergeRequestChanges(projectId?: number, mrIid?: number) {
  const [mrWithChanges, setMrWithChanges] =
    useState<GitLabMergeRequestWithChanges | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChanges = useCallback(async () => {
    if (!isGitLabClientInitialized() || !projectId || !mrIid) {
      setMrWithChanges(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getGitLabClient().getMergeRequestWithChanges(
        projectId,
        mrIid
      );
      setMrWithChanges(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取 MR 变更失败");
      setMrWithChanges(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, mrIid]);

  useEffect(() => {
    fetchChanges();
  }, [fetchChanges]);

  return { mrWithChanges, loading, error, fetchChanges };
}

/** MR 合并操作 Hook */
export function useMergeRequestMergeAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const merge = useCallback(
    async (
      projectId: number,
      mrIid: number,
      options?: GitLabMergeRequestMergeOptions
    ) => {
      if (!isGitLabClientInitialized()) {
        throw new Error("GitLab 客户端未初始化");
      }

      setLoading(true);
      setError(null);
      setSuccess(false);

      try {
        const mergedMr = await getGitLabClient().mergeMergeRequest(
          projectId,
          mrIid,
          options
        );
        setSuccess(true);
        return mergedMr;
      } catch (e) {
        const message = e instanceof Error ? e.message : "合并 MR 失败";
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setSuccess(false);
  }, []);

  return { merge, loading, error, success, reset };
}
