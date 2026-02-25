/**
 * Diff 解析工具
 * 统一的 unified diff 解析函数，供所有平台使用
 */

/** 解析 diff 内容，提取新增/删除行号 */
export function parseDiffChangedLines(diffContent: string): {
  additions: number[];
  deletions: number[];
} {
  const additions: number[] = [];
  const deletions: number[] = [];
  const lines = diffContent.split("\n");

  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1], 10);
      newLine = Number.parseInt(hunkMatch[2], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++ ")) {
      additions.push(newLine);
      newLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("--- ")) {
      deletions.push(oldLine);
      oldLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return { additions, deletions };
}
