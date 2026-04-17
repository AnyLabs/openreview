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
 * 支持从 markdown 代码块中提取，以及多种格式的响应
 */
export const parseReviewResult = (content: string): AIReviewResult => {
  try {
    let jsonStr: string | null = null;

    // 1. 尝试从 markdown 代码块中提取 JSON
    const codeBlockMatch = content.match(/```(?:json|javascript)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 2. 如果没有代码块，尝试直接解析整个内容
    if (!jsonStr) {
      // 查找第一个 { 和最后一个 }，提取 JSON 部分
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = content.substring(firstBrace, lastBrace + 1);
      }
    }

    // 3. 清理 jsonStr，如果仍为空则返回错误
    if (!jsonStr) {
      console.error("[ParseError] 无法从响应中提取 JSON 内容", { content });
      return {
        summary: "审查结果解析失败：无法找到 JSON 内容，请检查 AI 响应格式",
        comments: [],
      };
    }

    // 4. 尝试解析 JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[JSONParseError] JSON 解析失败", {
        jsonStr: jsonStr.substring(0, 200) + (jsonStr.length > 200 ? "..." : ""),
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return {
        summary: `审查结果解析失败：JSON 格式无效 (${parseError instanceof Error ? parseError.message : "未知错误"})`,
        comments: [],
      };
    }

    // 5. 验证必要字段并构建结果
    if (!parsed.summary || typeof parsed.summary !== "string") {
      console.warn("[ValidationWarning] 缺少 summary 字段或类型不正确");
    }

    if (!Array.isArray(parsed.comments)) {
      console.warn("[ValidationWarning] comments 不是数组");
    }

    return {
      summary: (typeof parsed.summary === "string" ? parsed.summary : null) || "无总结",
      comments: (Array.isArray(parsed.comments) ? parsed.comments : []).map(
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
  } catch (error) {
    console.error("[UnexpectedError] 解析审查结果时发生意外错误", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      summary: `审查结果解析失败：${error instanceof Error ? error.message : "未知错误"}`,
      comments: [],
    };
  }
};
