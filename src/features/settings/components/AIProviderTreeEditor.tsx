import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import type { AIProvider, ModelInfo } from "../../../types/gitlab";
import { modelDraftSchema, providerDraftSchema } from "../schemas/providerSchemas";
import { PRESET_PROVIDERS, findPresetProvider } from "../../../constants/preset-providers";

interface AIProviderTreeEditorProps {
  modeProviders: AIProvider[];
  setModeProviders: React.Dispatch<React.SetStateAction<AIProvider[]>>;
  providerId: string;
  setProviderId: (value: string) => void;
  modelId: string;
  setModelId: (value: string) => void;
  onPersistModeProviders?: (providers: AIProvider[]) => Promise<void> | void;
  onSelectionChange?: (selection: { providerId: string; modelId: string }) => Promise<void> | void;
  onNoticeChange?: (message: string | null) => void;
}

export function AIProviderTreeEditor({
  modeProviders,
  setModeProviders,
  providerId,
  setProviderId,
  modelId,
  setModelId,
  onPersistModeProviders,
  onSelectionChange,
  onNoticeChange,
}: AIProviderTreeEditorProps) {
  const truncateText = (value: string, maxLength: number) => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
  };

  const commitModeProviders = async (
    nextModeProviders: AIProvider[],
    successMessage?: string
  ) => {
    await onPersistModeProviders?.(nextModeProviders);
    setModeProviders(nextModeProviders);
    if (successMessage) {
      onNoticeChange?.(successMessage);
    } else {
      onNoticeChange?.(null);
    }
  };

  const [providerDraftName, setProviderDraftName] = useState("");
  const [providerDraftID, setProviderDraftID] = useState("");
  const [providerDraftApiUrl, setProviderDraftApiUrl] = useState("");
  const [providerDraftApiKey, setProviderDraftApiKey] = useState("");
  const [showProviderApiKey, setShowProviderApiKey] = useState(false);
  const [providerDraftError, setProviderDraftError] = useState<string | null>(null);
  const [providerFieldErrors, setProviderFieldErrors] = useState<{
    name?: string;
    id?: string;
    apiUrl?: string;
    apiKey?: string;
  }>({});

  const [modelDraftName, setModelDraftName] = useState("");
  const [modelDraftID, setModelDraftID] = useState("");
  const [modelDraftDescription, setModelDraftDescription] = useState("");
  const [modelDraftMaxInputToken, setModelDraftMaxInputToken] = useState("");
  const [modelDraftMaxContextToken, setModelDraftMaxContextToken] = useState("");
  const [modelDraftError, setModelDraftError] = useState<string | null>(null);
  const [modelFieldErrors, setModelFieldErrors] = useState<{
    name?: string;
    id?: string;
  }>({});
  const [providerFormMode, setProviderFormMode] = useState<"hidden" | "add" | "edit">("hidden");
  const [modelFormMode, setModelFormMode] = useState<"hidden" | "add" | "edit">("hidden");

  // 通过 id 查找当前选中的供应商
  const selectedProvider = useMemo(() => {
    return modeProviders.find((item) => item.id === providerId);
  }, [modeProviders, providerId]);
  const selectedModel = useMemo(() => {
    return selectedProvider?.models.find((item) => item.id === modelId);
  }, [selectedProvider, modelId]);

  // 编辑模型时，同步当前选中模型到草稿
  useEffect(() => {
    if (modelFormMode !== "edit") {
      return;
    }
    if (!selectedProvider || !modelId) {
      return;
    }

    const selectedModel = selectedProvider.models.find((item) => item.id === modelId);
    if (!selectedModel) {
      return;
    }

    fillModelDraft(selectedModel);
  }, [selectedProvider, modelId, modelFormMode]);

  const resetProviderDraft = () => {
    setProviderDraftName("");
    setProviderDraftID("");
    setProviderDraftApiUrl("");
    setProviderDraftApiKey("");
    setShowProviderApiKey(false);
    setProviderDraftError(null);
    setProviderFieldErrors({});
  };

  const fillProviderDraft = (provider: AIProvider) => {
    setProviderDraftName(provider.name);
    setProviderDraftID(provider.id || "");
    setProviderDraftApiUrl(provider.apiUrl || "");
    setProviderDraftApiKey(provider.apiKey || "");
    setShowProviderApiKey(false);
    setProviderDraftError(null);
    setProviderFieldErrors({});
  };

  const resetModelDraft = () => {
    setModelDraftName("");
    setModelDraftID("");
    setModelDraftDescription("");
    setModelDraftMaxInputToken("");
    setModelDraftMaxContextToken("");
    setModelDraftError(null);
    setModelFieldErrors({});
  };

  const fillModelDraft = (model: ModelInfo) => {
    setModelDraftName(model.name);
    setModelDraftID(model.id || "");
    setModelDraftDescription(model.description || "");
    setModelDraftMaxInputToken(
      typeof model.maxInputToken === "number" ? String(model.maxInputToken) : ""
    );
    setModelDraftMaxContextToken(
      typeof model.maxContextToken === "number" ? String(model.maxContextToken) : ""
    );
    setModelDraftError(null);
    setModelFieldErrors({});
  };

  /** 选择供应商（通过 id） */
  const handleSelectProvider = (id: string) => {
    setProviderId(id);
    setProviderFormMode("hidden");
    const found = modeProviders.find((item) => item.id === id);
    if (found) {
      fillProviderDraft(found);
    }
    setModelFormMode("hidden");
    setModelFieldErrors({});
    setModelDraftError(null);
    if (!found || found.models.length === 0) {
      setModelId("");
      void onSelectionChange?.({ providerId: id, modelId: "" });
      return;
    }
    const nextModelId = found.models.find((item) => item.id === modelId)
      ? modelId
      : found.models[0].id;
    if (nextModelId !== modelId) {
      setModelId(nextModelId);
    }
    void onSelectionChange?.({ providerId: id, modelId: nextModelId });
  };

  const handleSelectModel = (targetProviderId: string, targetModelId: string) => {
    setProviderId(targetProviderId);
    setModelId(targetModelId);
    setProviderFormMode("hidden");
    setModelFormMode("hidden");
    setModelFieldErrors({});
    setModelDraftError(null);
    void onSelectionChange?.({
      providerId: targetProviderId,
      modelId: targetModelId,
    });
  };

  const startAddProvider = () => {
    setModelFormMode("hidden");
    resetProviderDraft();
    setProviderFormMode("add");
  };

  const startEditProvider = (id: string) => {
    const found = modeProviders.find((item) => item.id === id);
    if (!found) return;
    setModelFormMode("hidden");
    setProviderId(id);
    fillProviderDraft(found);
    setProviderFormMode("edit");
  };

  const validateProviderDraft = () => {
    const nextName = providerDraftName.trim();
    const nextID = providerDraftID.trim();
    const existingProviderByID = modeProviders.find((item) => item.id === nextID);
    const nextApiUrl = providerDraftApiUrl.trim() || existingProviderByID?.apiUrl || "";
    const nextApiKey = providerDraftApiKey.trim() || existingProviderByID?.apiKey || "";
    const parsed = providerDraftSchema.safeParse({
      name: nextName,
      id: nextID,
      apiUrl: nextApiUrl,
      apiKey: nextApiKey,
    });
    if (!parsed.success) {
      const nextErrors: {
        name?: string;
        id?: string;
        apiUrl?: string;
        apiKey?: string;
      } = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (
          (key === "name" || key === "id" || key === "apiUrl" || key === "apiKey") &&
          !nextErrors[key]
        ) {
          nextErrors[key] = issue.message;
        }
      });
      setProviderFieldErrors(nextErrors);
      setProviderDraftError(null);
      return null;
    }

    setProviderFieldErrors({});
    setProviderDraftError(null);
    return {
      nextName: parsed.data.name,
      nextID: parsed.data.id,
      nextApiUrl: parsed.data.apiUrl,
      nextApiKey: parsed.data.apiKey,
    };
  };

  const handleAddProvider = async () => {
    const validated = validateProviderDraft();
    if (!validated) return;

    const { nextName, nextID, nextApiUrl, nextApiKey } = validated;
    const existingProviderByID = modeProviders.find((item) => item.id === nextID);
    if (existingProviderByID) {
      setProviderFieldErrors({ id: "供应商已存在，请使用“更新供应商”按钮覆盖同 ID 记录" });
      setProviderDraftError(null);
      return;
    }
    const existingProviderByName = modeProviders.find((item) => item.name === nextName);
    if (existingProviderByName) {
      setProviderFieldErrors({ name: "供应商名称已存在，请先修改名称" });
      setProviderDraftError(null);
      return;
    }

    const nextModeProviders = [
      ...modeProviders,
      {
        name: nextName,
        id: nextID,
        apiUrl: nextApiUrl,
        apiKey: nextApiKey,
        models: [],
      },
    ];

    try {
      await commitModeProviders(nextModeProviders, "供应商已保存并生效。");
      setProviderId(nextID);
      setModelId("");
      resetProviderDraft();
      setProviderFormMode("hidden");
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败，请稍后重试。";
      setProviderDraftError(message);
    }
  };

  const handleUpdateProvider = async () => {
    const validated = validateProviderDraft();
    if (!validated) return;

    const { nextName, nextID, nextApiUrl, nextApiKey } = validated;
    const existingProviderByID = modeProviders.find((item) => item.id === nextID);
    if (!existingProviderByID) {
      setProviderFieldErrors({ id: "供应商不存在，请先新增该供应商" });
      setProviderDraftError(null);
      return;
    }
    const existingProviderByName = modeProviders.find(
      (item) => item.name === nextName && item.id !== nextID
    );
    if (existingProviderByName) {
      setProviderFieldErrors({ name: "供应商名称已被其他供应商占用，请修改后重试" });
      setProviderDraftError(null);
      return;
    }

    const nextModeProviders = modeProviders.map((item) =>
      item.id === nextID
        ? {
            ...item,
            name: nextName,
            id: nextID,
            apiUrl: nextApiUrl,
            apiKey: nextApiKey,
          }
        : item
    );

    try {
      await commitModeProviders(nextModeProviders, "供应商已更新并生效。");
      setProviderId(nextID);
      resetProviderDraft();
      setProviderFormMode("hidden");
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败，请稍后重试。";
      setProviderDraftError(message);
    }
  };

  /** 删除供应商（通过 id） */
  const handleDeleteProvider = async (id: string) => {
    const nextModeProviders = modeProviders.filter((item) => item.id !== id);

    try {
      await commitModeProviders(nextModeProviders);
      if (providerId === id) {
        setProviderId("");
        setModelId("");
        onNoticeChange?.("已删除当前供应商并即时生效，请重新选择供应商与模型。");
      } else {
        onNoticeChange?.("供应商已删除并生效。");
      }
      setProviderFormMode("hidden");
      setModelFormMode("hidden");
    } catch (e) {
      const message = e instanceof Error ? e.message : "删除失败，请稍后重试。";
      setProviderDraftError(message);
    }
  };

  const validateModelDraft = () => {
    if (!selectedProvider) {
      setModelDraftError("请先选择供应商");
      return null;
    }
    const parsed = modelDraftSchema.safeParse({
      name: modelDraftName,
      id: modelDraftID,
      description: modelDraftDescription,
      maxInputToken: modelDraftMaxInputToken,
      maxContextToken: modelDraftMaxContextToken,
    });
    if (!parsed.success) {
      const nextErrors: { name?: string; id?: string } = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if ((key === "name" || key === "id") && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });
      setModelFieldErrors(nextErrors);
      setModelDraftError(null);
      return null;
    }

    setModelFieldErrors({});
    setModelDraftError(null);

    const modelDraft: ModelInfo = {
      name: parsed.data.name,
      id: parsed.data.id,
      description: parsed.data.description || undefined,
      maxInputToken: parsed.data.maxInputToken,
      maxContextToken: parsed.data.maxContextToken,
    };

    return {
      selectedProvider,
      modelDraft,
    };
  };

  const handleAddModel = async () => {
    const validated = validateModelDraft();
    if (!validated) return;

    const { selectedProvider: currentProvider, modelDraft } = validated;
    const existingModelByID = currentProvider.models.find((item) => item.id === modelDraft.id);
    if (existingModelByID) {
      setModelFieldErrors({ id: "模型已存在，请使用“更新模型”按钮覆盖同 ID 记录" });
      setModelDraftError(null);
      return;
    }
    const existingModelByName = currentProvider.models.find((item) => item.name === modelDraft.name);
    if (existingModelByName) {
      setModelFieldErrors({ name: "模型名称已存在，请先修改名称" });
      setModelDraftError(null);
      return;
    }

    const nextModeProviders = modeProviders.map((item) => {
      if (item.id !== currentProvider.id) return item;
      return {
        ...item,
        models: [...item.models, modelDraft],
      };
    });

    try {
      await commitModeProviders(nextModeProviders, "模型已保存并生效。");
      if (!modelId) {
        setModelId(modelDraft.id);
      }
      resetModelDraft();
      setModelFormMode("hidden");
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败，请稍后重试。";
      setModelDraftError(message);
    }
  };

  const handleUpdateModel = async () => {
    const validated = validateModelDraft();
    if (!validated) return;

    const { selectedProvider: currentProvider, modelDraft } = validated;
    const existingModelByID = currentProvider.models.find((item) => item.id === modelDraft.id);
    if (!existingModelByID) {
      setModelFieldErrors({ id: "模型不存在，请先新增该模型" });
      setModelDraftError(null);
      return;
    }
    const existingModelByName = currentProvider.models.find(
      (item) => item.name === modelDraft.name && item.id !== modelDraft.id
    );
    if (existingModelByName) {
      setModelFieldErrors({ name: "模型名称已被其他模型占用，请修改后重试" });
      setModelDraftError(null);
      return;
    }

    const nextModeProviders = modeProviders.map((item) => {
      if (item.id !== currentProvider.id) return item;
      return {
        ...item,
        models: item.models.map((model) => (model.id === modelDraft.id ? modelDraft : model)),
      };
    });

    try {
      await commitModeProviders(nextModeProviders, "模型已更新并生效。");
      setModelId(modelDraft.id);
      resetModelDraft();
      setModelFormMode("hidden");
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败，请稍后重试。";
      setModelDraftError(message);
    }
  };

  /** 删除模型（通过 id） */
  const handleDeleteModel = async (id: string) => {
    if (!selectedProvider) return;

    const nextModeProviders = modeProviders.map((item) =>
      item.id === selectedProvider.id
        ? {
            ...item,
            models: item.models.filter((m) => m.id !== id),
          }
        : item
    );

    try {
      await commitModeProviders(nextModeProviders);
      if (modelId === id) {
        const remaining = selectedProvider.models.filter((item) => item.id !== id);
        setModelId(remaining.length > 0 ? remaining[0].id : "");
        onNoticeChange?.(
          remaining.length > 0
            ? "已删除当前模型并生效，已自动切换到该供应商下的第一个模型。"
            : "已删除当前模型并生效，该供应商下已无可用模型，请重新添加或选择。"
        );
      } else {
        onNoticeChange?.("模型已删除并生效。");
      }
      setModelFormMode("hidden");
    } catch (e) {
      const message = e instanceof Error ? e.message : "删除失败，请稍后重试。";
      setModelDraftError(message);
    }
  };

  const startAddModel = () => {
    if (!selectedProvider) {
      onNoticeChange?.("请先选择一个供应商，再新增模型。");
      return;
    }
    setProviderFormMode("hidden");
    resetModelDraft();
    setModelFormMode("add");
  };

  const startEditModel = (id: string) => {
    if (!selectedProvider) return;
    const target = selectedProvider.models.find((item) => item.id === id);
    if (!target) return;
    setProviderFormMode("hidden");
    setModelId(id);
    fillModelDraft(target);
    setModelFormMode("edit");
  };

  return (
    <div className="provider-tree-editor">
      <div className="provider-tree-grid">
        <section className="provider-tree-panel provider-hierarchy-panel">
          <header className="provider-tree-panel-header">
            <h4>供应商与模型</h4>
            <span>{modeProviders.length} 个供应商</span>
          </header>

          <div className="provider-tree-list provider-hierarchy-list">
            {modeProviders.length === 0 ? (
              <div className="provider-tree-empty">暂无供应商，请先新增</div>
            ) : (
              modeProviders.map((item) => {
                const isProviderActive = providerId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`provider-tree-item provider-hierarchy-provider ${
                      isProviderActive ? "is-active" : ""
                    }`}
                  >
                    <div className="provider-tree-item-head">
                      <button
                        type="button"
                        className="provider-tree-item-main-btn"
                        onClick={() => handleSelectProvider(item.id)}
                      >
                        <span className="provider-tree-item-main">
                          <strong>{item.name}</strong>
                          <small>{`ID: ${item.id} | ${item.models.length} 个模型`}</small>
                        </span>
                      </button>
                      <div className="provider-tree-item-actions">
                        <button
                          type="button"
                          className="provider-tree-edit"
                          onClick={() => startEditProvider(item.id)}
                          aria-label={`编辑供应商 ${item.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="provider-tree-delete"
                          onClick={() => handleDeleteProvider(item.id)}
                          aria-label={`删除供应商 ${item.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="provider-hierarchy-model-list">
                      {item.models.length === 0 ? (
                        <div className="provider-tree-empty provider-hierarchy-empty-model">
                          该供应商暂无模型
                        </div>
                      ) : (
                        item.models.map((model) => (
                          <div key={model.id} className="provider-hierarchy-model-item">
                            <button
                              type="button"
                              className="provider-hierarchy-model-main-btn"
                              onClick={() => handleSelectModel(item.id, model.id)}
                            >
                              <span className="provider-tree-item-main">
                                <strong>{model.name}</strong>
                                <small>{`${model.id || "未设置ID"} | ${truncateText(model.description || "无描述", 10)}`}</small>
                              </span>
                            </button>
                            <div className="provider-tree-item-actions">
                              <button
                                type="button"
                                className="provider-tree-edit"
                                onClick={() => {
                                  handleSelectProvider(item.id);
                                  startEditModel(model.id);
                                }}
                                aria-label={`编辑模型 ${model.name}`}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="provider-tree-delete"
                                onClick={() => {
                                  handleSelectProvider(item.id);
                                  handleDeleteModel(model.id);
                                }}
                                aria-label={`删除模型 ${model.name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                  </div>
                );
              })
            )}
          </div>

          <div className="provider-tree-global-actions">
            <button type="button" className="provider-tree-add-entry" onClick={startAddProvider}>
              <Plus size={14} />
              新增供应商
            </button>
            <button type="button" className="provider-tree-add-entry" onClick={startAddModel}>
              <Plus size={14} />
              {selectedProvider ? "新增模型" : "先选择供应商后新增模型"}
            </button>
          </div>
        </section>

        <section className="provider-tree-panel provider-editor-panel">
          <header className="provider-tree-panel-header">
            <h4>当前编辑</h4>
            <span>{selectedProvider ? selectedProvider.name : "未选择供应商"}</span>
          </header>

          <div className="provider-editor-summary">
            <strong>{selectedProvider ? selectedProvider.name : "未选择供应商"}</strong>
            <small>
              {selectedProvider
                ? `供应商 ID: ${selectedProvider.id} | 模型数: ${selectedProvider.models.length}`
                : "请先在左侧选择或新增供应商"}
            </small>
            {selectedModel ? <small>{`当前选中模型: ${selectedModel.name} (${selectedModel.id})`}</small> : null}
          </div>

          {providerFormMode !== "hidden" ? (
            <div className="provider-editor-form">
              <div className="provider-editor-form-title">
                {providerFormMode === "add" ? "新增供应商" : "编辑供应商"}
              </div>
              <div className="form-field">
                <label htmlFor="provider-draft-name">
                  <span className="required-star">*</span>
                  供应商名称
                </label>
                <input
                  id="provider-draft-name"
                  type="text"
                  value={providerDraftName}
                  onChange={(e) => {
                    setProviderDraftName(e.target.value);
                    setProviderFieldErrors((prev) => ({ ...prev, name: undefined }));
                    setProviderDraftError(null);
                  }}
                  placeholder="例如：智谱"
                  className={`form-input ${providerFieldErrors.name ? "error" : ""}`}
                />
                {providerFieldErrors.name ? (
                  <div className="form-error">{providerFieldErrors.name}</div>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="provider-draft-id">
                  <span className="required-star">*</span>
                  供应商 ID
                </label>
                <input
                  id="provider-draft-id"
                  type="text"
                  list="preset-provider-list"
                  value={providerDraftID}
                  onChange={(e) => {
                    const nextID = e.target.value;
                    setProviderDraftID(nextID);
                    setProviderFieldErrors((prev) => ({ ...prev, id: undefined }));
                    setProviderDraftError(null);
                    // 命中预设供应商时，自动填充名称和 API URL（仅填充空白字段）
                    const preset = findPresetProvider(nextID);
                    if (preset) {
                      if (!providerDraftName.trim()) {
                        setProviderDraftName(preset.name);
                      }
                      if (!providerDraftApiUrl.trim()) {
                        setProviderDraftApiUrl(preset.apiUrl || "");
                      }
                    }
                  }}
                  placeholder="输入或从预设列表选择"
                  className={`form-input ${providerFieldErrors.id ? "error" : ""}`}
                />
                <datalist id="preset-provider-list">
                  {PRESET_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.apiUrl}
                    </option>
                  ))}
                </datalist>
                {providerFieldErrors.id ? (
                  <div className="form-error">{providerFieldErrors.id}</div>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="provider-draft-url">
                  <span className="required-star">*</span>
                  API 地址
                </label>
                <input
                  id="provider-draft-url"
                  type="url"
                  value={providerDraftApiUrl}
                  onChange={(e) => {
                    setProviderDraftApiUrl(e.target.value);
                    setProviderFieldErrors((prev) => ({ ...prev, apiUrl: undefined }));
                    setProviderDraftError(null);
                  }}
                  placeholder="https://xxx/v1"
                  className={`form-input ${providerFieldErrors.apiUrl ? "error" : ""}`}
                />
                {providerFieldErrors.apiUrl ? (
                  <div className="form-error">{providerFieldErrors.apiUrl}</div>
                ) : null}
              </div>
              <div className="form-field">
                <label htmlFor="provider-draft-key">
                  <span className="required-star">*</span>
                  API Key
                </label>
                <div className="input-with-icon">
                  <input
                    id="provider-draft-key"
                    type={showProviderApiKey ? "text" : "password"}
                    value={providerDraftApiKey}
                    onChange={(e) => {
                      setProviderDraftApiKey(e.target.value);
                      setProviderFieldErrors((prev) => ({ ...prev, apiKey: undefined }));
                      setProviderDraftError(null);
                    }}
                    placeholder="sk-xxxxxxxx"
                    className={`form-input ${providerFieldErrors.apiKey ? "error" : ""}`}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowProviderApiKey(!showProviderApiKey)}
                    title={showProviderApiKey ? "隐藏" : "显示"}
                  >
                    {showProviderApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {providerFieldErrors.apiKey ? (
                  <div className="form-error">{providerFieldErrors.apiKey}</div>
                ) : null}
              </div>

              {providerDraftError ? <div className="form-error">{providerDraftError}</div> : null}

              <div className="provider-editor-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setProviderFormMode("hidden")}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={providerFormMode === "add" ? handleAddProvider : handleUpdateProvider}
                >
                  保存
                </button>
              </div>
            </div>
          ) : null}

          {modelFormMode !== "hidden" ? (
            <div className="provider-editor-form">
              <div className="provider-editor-form-title">
                {modelFormMode === "add" ? "新增模型" : "编辑模型"}
              </div>
              <div className="form-field">
                <label htmlFor="model-draft-name">
                  <span className="required-star">*</span>
                  模型名称
                </label>
                <input
                  id="model-draft-name"
                  type="text"
                  value={modelDraftName}
                  onChange={(e) => {
                    setModelDraftName(e.target.value);
                    setModelFieldErrors((prev) => ({ ...prev, name: undefined }));
                    setModelDraftError(null);
                  }}
                  placeholder="例如：模型1"
                  className={`form-input ${modelFieldErrors.name ? "error" : ""}`}
                />
                {modelFieldErrors.name ? <div className="form-error">{modelFieldErrors.name}</div> : null}
              </div>

              <div className="form-field">
                <label htmlFor="model-draft-id">
                  <span className="required-star">*</span>
                  模型 ID
                </label>
                <input
                  id="model-draft-id"
                  type="text"
                  list="preset-model-list"
                  value={modelDraftID}
                  onChange={(e) => {
                    const nextModelID = e.target.value;
                    setModelDraftID(nextModelID);
                    setModelFieldErrors((prev) => ({ ...prev, id: undefined }));
                    setModelDraftError(null);
                    // 命中预设模型时，自动填充模型名称
                    const presetProvider = findPresetProvider(providerId);
                    const presetModel = presetProvider?.models.find((m) => m.id === nextModelID);
                    if (presetModel && !modelDraftName.trim()) {
                      setModelDraftName(presetModel.name);
                    }
                  }}
                  placeholder="输入或从预设列表选择"
                  className={`form-input ${modelFieldErrors.id ? "error" : ""}`}
                />
                <datalist id="preset-model-list">
                  {(findPresetProvider(providerId)?.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </datalist>
                {modelFieldErrors.id ? <div className="form-error">{modelFieldErrors.id}</div> : null}
              </div>

              <div className="form-field">
                <label htmlFor="model-draft-description">模型描述（可选）</label>
                <input
                  id="model-draft-description"
                  type="text"
                  value={modelDraftDescription}
                  onChange={(e) => setModelDraftDescription(e.target.value)}
                  placeholder="通用模型"
                  className="form-input"
                />
              </div>

              <div className="provider-editor-token-grid">
                <div className="form-field">
                  <label htmlFor="model-draft-max-input">最大输入 Token（可选）</label>
                  <input
                    id="model-draft-max-input"
                    type="number"
                    value={modelDraftMaxInputToken}
                    onChange={(e) => setModelDraftMaxInputToken(e.target.value)}
                    placeholder="12000"
                    className="form-input"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="model-draft-max-context">最大上下文 Token（可选）</label>
                  <input
                    id="model-draft-max-context"
                    type="number"
                    value={modelDraftMaxContextToken}
                    onChange={(e) => setModelDraftMaxContextToken(e.target.value)}
                    placeholder="100000"
                    className="form-input"
                  />
                </div>
              </div>

              {modelDraftError ? <div className="form-error">{modelDraftError}</div> : null}

              <div className="provider-editor-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModelFormMode("hidden")}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={modelFormMode === "add" ? handleAddModel : handleUpdateModel}
                >
                  保存
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
