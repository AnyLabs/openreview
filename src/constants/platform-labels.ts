/**
 * 平台文案映射
 * 根据平台类型切换对应的 UI 文案
 */

import type { PlatformType } from "../types/platform";

export interface PlatformLabels {
  name: string;
  org: string;
  repo: string;
  review: string;
  reviewShort: string;
  reviewPrefix: string;
  tokenPlaceholder: string;
  defaultUrl: string;
}

export const PLATFORM_LABELS: Record<PlatformType, PlatformLabels> = {
  gitlab: {
    name: "GitLab",
    org: "群组",
    repo: "项目",
    review: "合并请求",
    reviewShort: "MR",
    reviewPrefix: "!",
    tokenPlaceholder: "glpat-xxxxxxxxxxxx",
    defaultUrl: "https://gitlab.com",
  },
  github: {
    name: "GitHub",
    org: "组织",
    repo: "仓库",
    review: "Pull Request",
    reviewShort: "PR",
    reviewPrefix: "#",
    tokenPlaceholder: "ghp_xxxxxxxxxxxx",
    defaultUrl: "https://github.com",
  },
} as const;

/** 获取当前平台的文案 */
export function getPlatformLabels(platform: PlatformType): PlatformLabels {
  return PLATFORM_LABELS[platform];
}
