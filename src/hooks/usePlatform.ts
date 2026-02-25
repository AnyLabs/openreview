/**
 * 平台无关的数据获取 Hooks
 * 替代 useGitLab.ts，统一使用 PlatformAdapter 接口
 */

import { useState, useEffect, useCallback } from "react";
import type {
  PlatformOrg,
  PlatformRepo,
  PlatformReview,
  PlatformReviewWithChanges,
  MergeOptions,
  ReviewState,
} from "../types/platform";
import { requireActiveAdapter, hasActiveAdapter } from "../services/platform/factory";

/** 组织/群组列表 Hook */
export function useOrgs() {
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    if (!hasActiveAdapter()) {
      setOrgs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const adapter = requireActiveAdapter();
      const data = await adapter.getOrgs();
      setOrgs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取组织列表失败");
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { orgs, loading, error, fetchOrgs };
}

/** 仓库/项目列表 Hook */
export function useRepos(orgId?: number | string) {
  const [repos, setRepos] = useState<PlatformRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    if (!hasActiveAdapter()) {
      setRepos([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const adapter = requireActiveAdapter();
      const data = orgId
        ? await adapter.getOrgRepos(orgId)
        : await adapter.getRepos();
      setRepos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取仓库列表失败");
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return { repos, loading, error, fetchRepos };
}

/** Review（MR/PR）列表 Hook */
export function useReviews(
  repoId?: number,
  state: ReviewState = "open"
) {
  const [reviews, setReviews] = useState<PlatformReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!hasActiveAdapter() || !repoId) {
      setReviews([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const adapter = requireActiveAdapter();
      const data = await adapter.getReviews(repoId, state);
      setReviews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取 Review 列表失败");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [repoId, state]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, loading, error, fetchReviews };
}

/** Review 详情（含变更）Hook */
export function useReviewChanges(repoId?: number, reviewIid?: number) {
  const [reviewWithChanges, setReviewWithChanges] =
    useState<PlatformReviewWithChanges | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChanges = useCallback(async () => {
    if (!hasActiveAdapter() || !repoId || !reviewIid) {
      setReviewWithChanges(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const adapter = requireActiveAdapter();
      const data = await adapter.getReviewWithChanges(repoId, reviewIid);
      setReviewWithChanges(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取 Review 变更失败");
      setReviewWithChanges(null);
    } finally {
      setLoading(false);
    }
  }, [repoId, reviewIid]);

  useEffect(() => {
    fetchChanges();
  }, [fetchChanges]);

  return { reviewWithChanges, loading, error, fetchChanges };
}

/** Review 合并操作 Hook */
export function useReviewMergeAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const merge = useCallback(
    async (
      repoId: number,
      reviewIid: number,
      options?: MergeOptions
    ) => {
      if (!hasActiveAdapter()) {
        throw new Error("平台适配器未初始化");
      }

      setLoading(true);
      setError(null);
      setSuccess(false);

      try {
        const adapter = requireActiveAdapter();
        await adapter.mergeReview(repoId, reviewIid, options);
        setSuccess(true);
      } catch (e) {
        const message = e instanceof Error ? e.message : "合并 Review 失败";
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

/** Review 讨论 Hook */
export function useReviewDiscussions(repoId?: number, reviewIid?: number) {
  const [discussions, setDiscussions] = useState<
    import("../types/platform").PlatformDiscussion[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiscussions = useCallback(async () => {
    if (!hasActiveAdapter() || !repoId || !reviewIid) {
      setDiscussions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const adapter = requireActiveAdapter();
      const data = await adapter.getReviewDiscussions(repoId, reviewIid);
      setDiscussions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取讨论失败");
      setDiscussions([]);
    } finally {
      setLoading(false);
    }
  }, [repoId, reviewIid]);

  useEffect(() => {
    fetchDiscussions();
  }, [fetchDiscussions]);

  return { discussions, loading, error, fetchDiscussions };
}

/** Review 作者数据 Hook */
export function useReviewAuthorData(repoId?: number, reviewIid?: number) {
  const [authorData, setAuthorData] = useState<{
    fileAuthors: Record<string, string[]>;
    lineCommitters: Record<string, import("../types/platform").FileLineCommitters>;
  }>({ fileAuthors: {}, lineCommitters: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuthorData = useCallback(async () => {
    if (!hasActiveAdapter() || !repoId || !reviewIid) {
      setAuthorData({ fileAuthors: {}, lineCommitters: {} });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const adapter = requireActiveAdapter();
      const data = await adapter.getReviewAuthorData(repoId, reviewIid);
      setAuthorData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取作者数据失败");
      setAuthorData({ fileAuthors: {}, lineCommitters: {} });
    } finally {
      setLoading(false);
    }
  }, [repoId, reviewIid]);

  useEffect(() => {
    fetchAuthorData();
  }, [fetchAuthorData]);

  return { authorData, loading, error, fetchAuthorData };
}

/** 发表评论 Hook */
export function usePostComment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const postComment = useCallback(
    async (params: import("../types/platform").PostCommentParams) => {
      if (!hasActiveAdapter()) {
        throw new Error("平台适配器未初始化");
      }

      setLoading(true);
      setError(null);
      setSuccess(false);

      try {
        const adapter = requireActiveAdapter();
        await adapter.postComment(params);
        setSuccess(true);
      } catch (e) {
        const message = e instanceof Error ? e.message : "发表评论失败";
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

  return { postComment, loading, error, success, reset };
}
