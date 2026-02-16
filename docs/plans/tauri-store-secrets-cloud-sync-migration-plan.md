# Tauri Store + 可选加密 + 云同步预留存储方案（已按实现更新）

## 1. 背景与目标

当前项目已落地为桌面优先存储方案，核心目标是：
1. 配置统一存储在 `Tauri Store`，避免 WebView `localStorage` 作为主存储。
2. 敏感字段支持“可选加密”，但不引入系统凭据库交互打扰。
3. 配置结构支持新的模型接入设计：`ProvideMode + ModeProviders`。
4. 为未来云同步保留版本、设备和冲突处理元数据。

## 2. 当前实现基线

- 存储服务：`src/services/storage.ts`
- 类型定义：`src/types/gitlab.ts`
- 状态初始化：`src/hooks/useAppState.ts`
- 设置页（供应商配置独立板块）：
  - `src/features/settings/components/SettingsForm.tsx`
  - `src/features/settings/components/AIProviderConfigPanel.tsx`

当前主存储：
- `Tauri Store` 文件：`settings.json`
- 配置主键：`app_config`
- 主题键：`theme`

Web 环境（非 Tauri）仅作为兼容回退：
- `code-reviewer-config`
- `theme`

## 3. 存储分层（当前版）

1. `Tauri Store`
- 存储配置结构与业务元数据。
- 敏感字段使用“密文字段”写入同一 Store。

2. 内存态（React 状态）
- 仅运行时使用，不作为长期数据源。

3. Web 回退（仅非 Tauri）
- 在浏览器场景使用 `localStorage` 兜底。

说明：当前实现**不使用系统凭据库**（Keychain/Credential Manager/Secret Service）。

## 4. 配置模型（当前实现：V3）

### 4.1 业务模型（AI）

```ts
export interface AIConfig {
  ProvideMode: "openai";
  ProviderId?: string;   // 当前选中的供应商 ID（对应 AIProvider.id）
  ModelId?: string;      // 当前选中的模型 ID（对应 ModelInfo.id）
  ModeProviders: AIProvider[];
  language: string;
  rules: string[];
}

export interface AIProvider {
  name: string;
  id: string;
  models: ModelInfo[];
}

export interface ModelInfo {
  name: string;
  id: string;        // 必填，唯一标识
  apiUrl?: string;
  apiKey?: string;
  description?: string;
  maxInputToken?: number;
  maxContextToken?: number;
}
```

> **唯一标识规范**：全系统以 `id` 作为供应商和模型的唯一键，`name` 仅用于 UI 展示。`ProviderName`/`ModelName` 已废弃，改为 `ProviderId`/`ModelId`。

### 4.2 Store 模型（V3）

`app_config` 的核心结构：
- `schemaVersion: 3`
- `profile`: 非敏感业务字段（含 `provideMode/providerId/modelId/modeProviders`）
- `secrets`:
  - `providerApiKeys`: 每个供应商（以 `provider.id` 为 key）的加密 API Key 映射
  - `gitlabToken`: GitLab Token 的加密值
  - `aiApiKey`: 旧结构兼容字段（保留）
- `sync`: 云同步预留字段
- `meta`: 创建/更新时间

## 5. 加密策略（当前实现）

1. 加密模式
- 开关：`ENABLE_OPTIONAL_SECRET_ENCRYPTION = true`
- 算法：Web Crypto `AES-GCM`
- 密钥派生基于 `device-id`（本地生成并持久化）

2. 失败策略
- 若加密不可用或异常，自动降级为 `plain` 存储，不阻断功能。
- 解密失败时返回空值，并由上层配置校验兜底。

3. 保护范围
- 主要保护 `GitLab token` 与各模型 `apiKey`。
- `profile.modeProviders` 中会清空明文 `apiKey` 后再落盘。

## 6. 迁移与兼容策略（当前版）

1. 当前已执行策略
- **不再执行旧 `localStorage` 自动迁移**（Tauri 场景）。
- Tauri 启动流程：
  - 读取 `Tauri Store`
  - 若无有效配置，使用默认配置

2. 保留兼容
- 仍兼容读取 `schemaVersion=2` 的旧 Store 结构并转换为当前内存结构。
- Web 非 Tauri 场景保留 `localStorage` 读取逻辑。
- Beta 阶段对 V3 字段重命名（`providerName` → `providerId`、`modelName` → `modelId`）不做代码兆底，用户重新保存时自动覆盖为新格式。

## 7. 云同步预留（当前状态）

已落地字段：
- `sync.enabled`
- `sync.deviceId`
- `sync.revision`
- `sync.lastSyncedAt`
- `sync.dirtyFields`

预期同步策略（后续）：
1. 默认仅同步非敏感字段。
2. 敏感字段按策略决定（建议默认不上传，或端到端加密后上传）。
3. 冲突处理采用字段级 `LWW`，关键字段可增加人工确认。

## 8. 实施里程碑（按当前进度更新）

1. M1（已完成）
- 统一存储服务抽象（`load/save/isConfigured`）。

2. M2（已完成）
- 接入 `Tauri Store` 主存储。
- 引入可选加密与降级策略。

3. M3（已完成）
- AI 配置模型升级为 `ProvideMode + ModeProviders`。
- 设置页拆分“模型供应商配置”独立板块。
- 供应商/模型唯一标识从 `name` 迁移为 `id`（`ProviderName` → `ProviderId`，`ModelName` → `ModelId`）。

4. M4（进行中）
- 文档、边界行为、兼容路径持续收敛。

5. M5（待实施）
- 云同步协议与灰度发布。

## 9. 验收标准（当前版本）

1. 在 Tauri 环境下，配置可稳定从 `Tauri Store` 读取与保存。
2. `ModeProviders` 明文 `apiKey` 不直接落入 `profile`。
3. 可选加密异常不会阻塞主流程。
4. `ProvideMode=openai` 时可基于供应商与模型完成配置校验和调用。
5. 现有构建与类型检查通过。

## 10. 风险与回滚预案

风险：
- 设备 ID 变化可能导致历史密文无法解密。
- 加密降级为明文时，安全性下降。
- 旧版本数据结构差异导致部分字段缺失。

回滚预案：
1. 保留 `schemaVersion` 分支处理，支持兼容解析。
2. 解密失败自动清空敏感值并提示重新配置。
3. 必要时可临时关闭加密开关，先保障可用性。
