import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const srcDir = path.join(projectRoot, "src");
const capabilityFile = path.join(projectRoot, "src-tauri", "capabilities", "default.json");

const appFunctionPermissionMap = new Map([
  ["setTheme", "core:app:allow-set-app-theme"]
]);

const windowMethodPermissionMap = new Map([
  ["setBackgroundColor", "core:window:allow-set-background-color"]
]);

const allowedApiModules = new Set(["app", "window", "core"]);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function collectSourceFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function getLine(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function main() {
  let capability;
  try {
    capability = readJson(capabilityFile);
  } catch (error) {
    console.error("读取 capability 文件失败:", capabilityFile);
    console.error(error);
    process.exit(1);
  }

  const permissionList = capability?.permissions;
  if (!Array.isArray(permissionList)) {
    console.error("capability 文件格式错误：permissions 必须是数组");
    process.exit(1);
  }

  const permissions = new Set(permissionList);
  const requiredPermissions = new Set();

  const issues = [];
  const files = collectSourceFiles(srcDir);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(projectRoot, filePath);
    const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true, scriptKind);

    const appImports = new Map();
    const getCurrentWindowLocals = new Set();
    const currentWindowVars = new Set();

    function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const modulePath = node.moduleSpecifier.text;
        const importClause = node.importClause;
        const namedBindings = importClause?.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          if (modulePath.startsWith("@tauri-apps/api/")) {
            const moduleName = modulePath.slice("@tauri-apps/api/".length);
            if (!allowedApiModules.has(moduleName)) {
              issues.push(
                `${relativePath}:${getLine(sourceFile, node.getStart(sourceFile))} 使用了未登记模块 ${modulePath}，请更新权限校验规则`
              );
            }
          } else if (modulePath === "@tauri-apps/api") {
            issues.push(
              `${relativePath}:${getLine(sourceFile, node.getStart(sourceFile))} 使用了 @tauri-apps/api 聚合导入，请改为按子模块导入并更新校验规则`
            );
          }
        }

        if (modulePath === "@tauri-apps/api/app" && namedBindings && ts.isNamedImports(namedBindings)) {
          for (const specifier of namedBindings.elements) {
            if (specifier.isTypeOnly) {
              continue;
            }
            const importedName = specifier.propertyName ? specifier.propertyName.text : specifier.name.text;
            const localName = specifier.name.text;
            if (!appFunctionPermissionMap.has(importedName)) {
              issues.push(
                `${relativePath}:${getLine(sourceFile, specifier.getStart(sourceFile))} 新增 app API ${importedName}，请在校验脚本中补充权限映射`
              );
              continue;
            }
            appImports.set(localName, importedName);
          }
        }

        if (modulePath === "@tauri-apps/api/window" && namedBindings && ts.isNamedImports(namedBindings)) {
          for (const specifier of namedBindings.elements) {
            if (specifier.isTypeOnly) {
              continue;
            }
            const importedName = specifier.propertyName ? specifier.propertyName.text : specifier.name.text;
            const localName = specifier.name.text;
            if (importedName === "getCurrentWindow") {
              getCurrentWindowLocals.add(localName);
              continue;
            }
            issues.push(
              `${relativePath}:${getLine(sourceFile, specifier.getStart(sourceFile))} 新增 window API ${importedName}，请在校验脚本中补充规则`
            );
          }
        }
      }

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (
          ts.isCallExpression(node.initializer) &&
          ts.isIdentifier(node.initializer.expression) &&
          getCurrentWindowLocals.has(node.initializer.expression.text)
        ) {
          currentWindowVars.add(node.name.text);
        }
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const importedName = appImports.get(node.expression.text);
        if (importedName) {
          requiredPermissions.add(appFunctionPermissionMap.get(importedName));
        }
      }

      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text;
        const methodTarget = node.expression.expression;

        const isDirectWindowTarget =
          ts.isCallExpression(methodTarget) &&
          ts.isIdentifier(methodTarget.expression) &&
          getCurrentWindowLocals.has(methodTarget.expression.text);

        const isVariableWindowTarget =
          ts.isIdentifier(methodTarget) && currentWindowVars.has(methodTarget.text);

        if (isDirectWindowTarget || isVariableWindowTarget) {
          const mappedPermission = windowMethodPermissionMap.get(methodName);
          if (!mappedPermission) {
            issues.push(
              `${relativePath}:${getLine(sourceFile, node.getStart(sourceFile))} 新增 window 方法 ${methodName}，请在校验脚本中补充权限映射`
            );
          } else {
            requiredPermissions.add(mappedPermission);
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  for (const permission of requiredPermissions) {
    if (!permissions.has(permission)) {
      issues.push(`缺少 capability 权限: ${permission}`);
    }
  }

  if (issues.length > 0) {
    console.error("Tauri 权限校验失败：");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    console.error(
      "\n请同步更新 src-tauri/capabilities/default.json 与 scripts/check-tauri-permissions.mjs。"
    );
    process.exit(1);
  }

  if (requiredPermissions.size === 0) {
    console.log("未检测到需要 capability 校验的 Tauri API 调用。");
    return;
  }

  const sortedPermissions = [...requiredPermissions].sort();
  console.log("Tauri 权限校验通过，已校验权限:");
  for (const permission of sortedPermissions) {
    console.log(`- ${permission}`);
  }
}

main();
