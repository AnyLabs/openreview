/**
 * 审查 Prompt 常量与共享工具函数
 * 集中维护两个 adapter 共用的提示词模板、默认规则、规则格式化、结果解析逻辑
 */

import type { AIReviewResult, AIReviewComment } from "../ai";

// ─── 默认规则 ───────────────────────────────────────────

/** 默认审查规则（当用户未配置自定义规则时使用） */
export const DEFAULT_REVIEW_RULES = [
  "检查潜在的 bug 和逻辑错误",
];

// ─── Prompt 片段 ────────────────────────────────────────

/** 系统角色设定 */
export const SYSTEM_ROLE = "你是一位专业的代码审查专家。请根据以下规则审查代码差异：";

/** JSON 输出格式描述（不含代码块包裹，适用于 OpenAI response_format） */
export const JSON_FORMAT_SPEC = `{
  "summary": "总体评价（100字以内，简洁明了）",
  "comments": [
    {
      "line": 10,
      "content": "问题或建议",
      "severity": "error|warning|info"
    }
  ]
}`;

/** 通用输出要求 */
export const OUTPUT_REQUIREMENTS = [
  "summary 必须控制在 100 字以内，简洁概括主要问题",
  "只包含有意义的评论，要具体且可操作",
  "不要返回思考过程或分析步骤",
  "只返回 JSON 格式数据，不要有其他文字",
];

// ─── 工具函数 ────────────────────────────────────────────

/**
 * 将规则列表格式化为编号文本
 * 空或未配置时回退到默认规则
 */
export const formatRules = (rules: string[]): string => {
  const effectiveRules = rules.length > 0 ? rules : DEFAULT_REVIEW_RULES;
  return effectiveRules.map((r, i) => `${i + 1}. ${r}`).join("\n");
};

/**
 * 格式化输出要求为编号文本
 */
export const formatRequirements = (extra: string[] = []): string => {
  const all = [...OUTPUT_REQUIREMENTS, ...extra];
  return all.map((r, i) => `${i + 1}. ${r}`).join("\n");
};

/**
 * 构建语言约束提示
 */
export const buildLanguageConstraint = (language: string): string =>
  `重要：所有响应必须使用${language}。`;

/**
 * 移除文本中的 emoji 表情符号
 */
export const removeEmoji = (text: string): string =>
  text.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu,
    "",
  );

/**
 * 解析 AI 返回的审查结果 JSON
 * 支持从 markdown 代码块中提取
 */
export const parseReviewResult = (content: string): AIReviewResult => {
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

    const parsed = JSON.parse(jsonStr);
    return {
      summary: parsed.summary || "无总结",
      comments: (parsed.comments || []).map(
        (c: Record<string, unknown>): AIReviewComment => ({
          line: typeof c.line === "number" ? c.line : 1,
          content: String(c.content || ""),
          severity: ["error", "warning", "info"].includes(
            c.severity as string,
          )
            ? (c.severity as "error" | "warning" | "info")
            : "info",
        }),
      ),
    };
  } catch {
    return {
      summary: "审查结果解析失败，请检查 AI 响应格式",
      comments: [],
    };
  }
};
