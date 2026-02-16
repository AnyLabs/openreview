import { useCallback, useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";
import { AIProviderTreeEditor } from "./AIProviderTreeEditor";
import type { AIProvider } from "../../../types/gitlab";

interface AIProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIProviderModal({ isOpen, onClose }: AIProviderModalProps) {
  const [state, actions] = useApp();
  const { config } = state;

  const [modeProviders, setModeProviders] = useState<AIProvider[]>(
    config.ai.modeProviders || []
  );
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveSelection = useCallback(
    (
      providers: AIProvider[],
      preferredProviderId?: string,
      preferredModelId?: string
    ) => {
      const selectedProvider =
        providers.find((item) => item.id === preferredProviderId) || providers[0];
      if (!selectedProvider) {
        return { providerId: "", modelId: "" };
      }
      const selectedModel =
        selectedProvider.models.find((item) => item.id === preferredModelId) ||
        selectedProvider.models[0];
      return {
        providerId: selectedProvider.id,
        modelId: selectedModel?.id || "",
      };
    },
    []
  );

  const pickInitialSelection = useCallback((providers: AIProvider[]) => {
    const fallback = resolveSelection(providers);
    const preferred = resolveSelection(
      providers,
      config.ai.providerId,
      config.ai.modelId
    );
    return {
      providerId: preferred.providerId || fallback.providerId,
      modelId: preferred.modelId || fallback.modelId,
    };
  }, [config.ai.modelId, config.ai.providerId, resolveSelection]);

  useEffect(() => {
    if (!isOpen) return;
    const providers = config.ai.modeProviders || [];
    const initialSelection = pickInitialSelection(providers);
    setModeProviders(providers);
    setProviderId(initialSelection.providerId);
    setModelId(initialSelection.modelId);
    setNotice(null);
    setError(null);
  }, [isOpen, config.ai, pickInitialSelection]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handlePersistModeProviders = async (nextModeProviders: AIProvider[]) => {
    setError(null);
    try {
      const resolved = resolveSelection(nextModeProviders, providerId, modelId);
      await actions.updateAIConfig({
        ...config.ai,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        modeProviders: nextModeProviders,
      });
      setModeProviders(nextModeProviders);
      setProviderId(resolved.providerId);
      setModelId(resolved.modelId);
      setNotice("供应商与模型配置已即时保存并生效。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请稍后重试。");
    }
  };

  const handleSelectionChange = async (selection: {
    providerId: string;
    modelId: string;
  }) => {
    setError(null);
    const resolved = resolveSelection(
      modeProviders,
      selection.providerId,
      selection.modelId
    );

    setProviderId(resolved.providerId);
    setModelId(resolved.modelId);

    if (
      resolved.providerId === (config.ai.providerId || "") &&
      resolved.modelId === (config.ai.modelId || "")
    ) {
      return;
    }

    try {
      await actions.updateAIConfig({
        ...config.ai,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        modeProviders,
      });
      setNotice("当前生效模型已更新。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换生效模型失败，请稍后重试。");
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="settings-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-modal-title"
    >
      <div className="settings-modal-container provider-modal-container">
        <div className="settings-modal-header provider-modal-header">
          <div className="settings-modal-title">
            <Bot size={18} />
            <h2 id="provider-modal-title">AI模型配置</h2>
          </div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-modal-body provider-modal-body">
          {notice ? <div className="form-success">{notice}</div> : null}
          {error ? <div className="form-error">{error}</div> : null}

          <AIProviderTreeEditor
            modeProviders={modeProviders}
            setModeProviders={setModeProviders}
            providerId={providerId}
            setProviderId={setProviderId}
            modelId={modelId}
            setModelId={setModelId}
            onPersistModeProviders={handlePersistModeProviders}
            onSelectionChange={handleSelectionChange}
            onNoticeChange={setNotice}
          />
        </div>
      </div>
    </div>
  );
}
