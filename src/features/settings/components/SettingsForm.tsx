/**
 * 设置表单组件 - Git 平台和 AI 配置
 */

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Save, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { useApp } from "../../../contexts/AppContext";
import { Select } from "../../../components/ui/select";
import { useTheme } from "../../../contexts/ThemeContext";
import {
  type AIFormValues,
  type PlatformFormValues,
  aiFormSchema,
  platformFormSchema,
} from "../schemas/settingsSchemas";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../../components/ui/form";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Button } from "../../../components/ui/button";
import type { PlatformType } from "../../../types/platform";
import { PLATFORM_LABELS } from "../../../constants/platform-labels";

interface SettingsFormProps {
  onSubmitSuccess?: () => void;
}

function getAIFormDefaults(config: ReturnType<typeof useApp>[0]["config"]): AIFormValues {
  return {
    openaiProviderId: config.ai.providerId || "",
    openaiModelId: config.ai.modelId || "",
    reviewLanguage: config.ai.language || "简体中文",
    reviewRules: config.ai.rules?.join("\n") || "",
  };
}

export function SettingsForm({ onSubmitSuccess }: SettingsFormProps) {
  const [state, actions] = useApp();
  const { config, isConnected, isConnecting, error, activePlatform } = state;
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();

  const [showToken, setShowToken] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "success">("idle");

  const platformForm = useForm<PlatformFormValues>({
    resolver: zodResolver(platformFormSchema),
    mode: "onBlur",
    defaultValues: {
      platform: activePlatform,
      platformUrl: activePlatform === "github" ? config.github.url : config.gitlab.url,
      platformToken: activePlatform === "github" ? config.github.token : config.gitlab.token,
    },
  });

  const aiForm = useForm<AIFormValues>({
    resolver: zodResolver(aiFormSchema),
    mode: "onBlur",
    defaultValues: getAIFormDefaults(config),
  });

  const watchedPlatform = platformForm.watch("platform");
  const openaiProviderId = aiForm.watch("openaiProviderId");
  const openaiModelId = aiForm.watch("openaiModelId");

  // 切换平台时更新表单值
  useEffect(() => {
    const newPlatformUrl = watchedPlatform === "github"
      ? config.github.url
      : config.gitlab.url;
    const newPlatformToken = watchedPlatform === "github"
      ? config.github.token
      : config.gitlab.token;
    platformForm.setValue("platformUrl", newPlatformUrl);
    platformForm.setValue("platformToken", newPlatformToken);
  }, [watchedPlatform, config]);

  useEffect(() => {
    platformForm.reset({
      platform: activePlatform,
      platformUrl: activePlatform === "github" ? config.github.url : config.gitlab.url,
      platformToken: activePlatform === "github" ? config.github.token : config.gitlab.token,
    });
    aiForm.reset(getAIFormDefaults(config));
  }, [config, activePlatform, aiForm, platformForm]);

  useEffect(() => {
    const providerOptions = config.ai.modeProviders;
    if (providerOptions.length === 0) {
      aiForm.setValue("openaiProviderId", "", { shouldValidate: true });
      aiForm.setValue("openaiModelId", "", { shouldValidate: true });
      return;
    }

    const selectedProvider = providerOptions.find((item) => item.id === openaiProviderId);
    const nextProvider = selectedProvider ?? providerOptions[0];
    if (!selectedProvider && nextProvider) {
      aiForm.setValue("openaiProviderId", nextProvider.id, { shouldValidate: true });
    }

    const models = nextProvider?.models ?? [];
    if (models.length === 0) {
      if (openaiModelId) {
        aiForm.setValue("openaiModelId", "", { shouldValidate: true });
      }
      return;
    }

    if (!models.find((item) => item.id === openaiModelId)) {
      aiForm.setValue("openaiModelId", models[0].id, { shouldValidate: true });
    }
  }, [config.ai.modeProviders, openaiProviderId, openaiModelId, aiForm]);

  const themeOptions = useMemo(
    () => [
      { value: "dark", label: "深色主题", description: "始终使用深色外观" },
      { value: "light", label: "浅色主题", description: "始终使用浅色外观" },
      { value: "system", label: "跟随系统颜色配置", description: "自动跟随系统深浅色" },
    ],
    []
  );

  const platformOptions = useMemo(
    () => [
      { value: "gitlab" as const, label: PLATFORM_LABELS.gitlab.name, description: PLATFORM_LABELS.gitlab.review },
      { value: "github" as const, label: PLATFORM_LABELS.github.name, description: PLATFORM_LABELS.github.review },
    ],
    []
  );

  const languageOptions = useMemo(
    () => [
      { value: "简体中文", label: "简体中文", description: "简体中文" },
      { value: "English", label: "English", description: "英文" },
    ],
    []
  );

  const openaiProviderOptions = useMemo(
    () =>
      config.ai.modeProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
        description: provider.apiUrl || undefined,
      })),
    [config.ai.modeProviders]
  );

  const openaiModelOptions = useMemo(() => {
    const selectedProvider = config.ai.modeProviders.find(
      (provider) => provider.id === openaiProviderId
    );
    return (selectedProvider?.models || []).map((model) => ({
      value: model.id,
      label: model.name,
      description: model.description || undefined,
    }));
  }, [config.ai.modeProviders, openaiProviderId]);

  const isOpenAIConfigured = useMemo(() => {
    if (!config.ai.providerId || !config.ai.modelId) {
      return false;
    }
    const selectedProvider = config.ai.modeProviders.find(
      (item) => item.id === config.ai.providerId
    );
    if (!selectedProvider) {
      return false;
    }
    const selectedModel = selectedProvider.models.find(
      (item) => item.id === config.ai.modelId
    );
    return Boolean(
      selectedProvider.id &&
        selectedProvider.apiUrl &&
        selectedProvider.apiKey &&
        selectedModel?.id
    );
  }, [config.ai]);

  const onPlatformSubmit = platformForm.handleSubmit(async (values) => {
    const platform = values.platform as PlatformType;
    if (platform === "gitlab") {
      await actions.updateGitLabConfig(values.platformUrl, values.platformToken);
    } else {
      await actions.updateGitHubConfig(values.platformUrl, values.platformToken);
    }
    onSubmitSuccess?.();
  });

  const onAISubmit = aiForm.handleSubmit(async (values) => {
    setSaveStatus("loading");

    await actions.updateAIConfig({
      ...config.ai,
      providerId: values.openaiProviderId,
      modelId: values.openaiModelId,
      language: values.reviewLanguage,
      rules: values.reviewRules
        .split("\n")
        .map((rule) => rule.trim())
        .filter((rule) => rule.length > 0),
    });

    setSaveStatus("success");
    window.setTimeout(() => setSaveStatus("idle"), 1800);
    onSubmitSuccess?.();
  });

  // 获取当前平台的标签
  const currentPlatformLabels = watchedPlatform
    ? PLATFORM_LABELS[watchedPlatform]
    : PLATFORM_LABELS.gitlab;

  return (
    <div className="settings-form">
      <div className="settings-section">
        <h4 className="settings-section-title">外观</h4>

        <div className="form-field">
          <label>主题管理</label>
          <Select
            options={themeOptions}
            value={themeMode}
            onChange={(value) => setThemeMode(value as "dark" | "light" | "system")}
            placeholder="选择主题..."
            searchPlaceholder="搜索主题..."
          />
          <small className="form-hint">
            当前生效主题：{resolvedTheme === "dark" ? "深色" : "浅色"}
          </small>
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section-title">Git 平台连接</h4>

        <Form {...platformForm}>
          <form onSubmit={onPlatformSubmit}>
            <FormField
              control={platformForm.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>平台</FormLabel>
                  <FormControl>
                    <Select
                      options={platformOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="选择平台..."
                      searchPlaceholder="搜索平台..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={platformForm.control}
              name="platformUrl"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>服务器地址</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder={currentPlatformLabels.defaultUrl}
                      className={fieldState.invalid ? "error" : ""}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={platformForm.control}
              name="platformToken"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Personal Access Token</FormLabel>
                  <FormControl>
                    <div className="input-with-icon">
                      <Input
                        type={showToken ? "text" : "password"}
                        placeholder={currentPlatformLabels.tokenPlaceholder}
                        className={fieldState.invalid ? "error" : ""}
                        {...field}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setShowToken(!showToken)}
                        title={showToken ? "隐藏" : "显示"}
                      >
                        {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error ? <div className="form-error">{error}</div> : null}

            <div className="form-actions">
              <Button
                variant="primary"
                type="submit"
                disabled={
                  isConnecting ||
                  !platformForm.watch("platformUrl") ||
                  !platformForm.watch("platformToken")
                }
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    连接中...
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    {isConnected ? "重新连接" : "连接"}
                  </>
                )}
              </Button>

              {isConnected ? <span className="status-badge success">已连接</span> : null}
            </div>
          </form>
        </Form>
      </div>

      <div className="settings-section">
        <h4 className="settings-section-title">AI 配置</h4>

        <Form {...aiForm}>
          <form onSubmit={onAISubmit}>
            <div className="form-field">
              <small className="form-hint">
                供应商与模型详情请在侧边栏「AI模型配置」中维护；这里选择当前生效项。
              </small>
            </div>

            <FormField
              control={aiForm.control}
              name="openaiProviderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>生效供应商</FormLabel>
                  <FormControl>
                    <Select
                      options={openaiProviderOptions}
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        const provider = config.ai.modeProviders.find(
                          (item) => item.id === value
                        );
                        const models = provider?.models || [];
                        aiForm.setValue("openaiModelId", models[0]?.id || "", {
                          shouldValidate: true,
                        });
                      }}
                      placeholder="选择生效供应商..."
                      searchPlaceholder="搜索供应商..."
                      emptyText="暂无可选供应商，请先到 AI模型配置 中新增"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={aiForm.control}
              name="openaiModelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>生效模型</FormLabel>
                  <FormControl>
                    <Select
                      options={openaiModelOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="选择生效模型..."
                      searchPlaceholder="搜索模型..."
                      emptyText="当前供应商下暂无可选模型"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={aiForm.control}
              name="reviewLanguage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>评审语言</FormLabel>
                  <FormControl>
                    <Select
                      options={languageOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="选择评审语言..."
                    />
                  </FormControl>
                  <FormDescription>AI 代码审查结果将使用该语言返回。</FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={aiForm.control}
              name="reviewRules"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>评审规则</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder="每行一条规则，例如：&#10;检查潜在的 bug 和逻辑错误&#10;验证错误处理是否恰当&#10;确保代码遵循最佳实践"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>留空将使用默认规则。</FormDescription>
                </FormItem>
              )}
            />

            <div className="form-actions">
              <Button variant="gradient" type="submit" disabled={saveStatus === "loading"}>
                {saveStatus === "loading" ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    保存中...
                  </>
                ) : saveStatus === "success" ? (
                  <>
                    <Check size={16} />
                    保存成功
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    保存 AI 配置
                  </>
                )}
              </Button>

              {isOpenAIConfigured ? <span className="status-badge success">已配置</span> : null}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
